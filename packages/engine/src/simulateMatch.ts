/**
 * 틱 기반 경기 시뮬레이션 (engine.md 4장).
 * 점유 → 전진 → 슈팅 → 결과 순서로 매 분 확률 판정.
 * 시드 고정 시 완전 재현 가능.
 *
 * 내부는 컨텍스트(createContext) + 분 단위 스텝(stepMinute) + 마무리(finalize)로
 * 분리되어, 일괄 시뮬(simulateMatch)과 재개 가능한 라이브 경기(liveMatch.ts)가
 * 동일한 로직을 공유한다.
 */
import type {
  CardEvent, ChanceType, Club, InjuryEvent, MatchEvent, MatchResult, Player, Position,
  PlayerMatchStat, ShotOutcome, Tactic, TeamStrength,
} from './types.js';
import { computeTeamStrength, lineOf } from './teamStrength.js';
import { isAvailable } from './derived.js';
import { Rng } from './rng.js';
import { clamp, logistic } from './math.js';
import { TUNING } from './tuning.js';
import { hasTrait } from './traits.js';
import { rollInjury, medicalBias, reinjuryRiskFactor } from './injury.js';
import { effectiveMedical } from './staffActions.js';
import {
  findManMarker, manMarkWeightMultiplier, manMarkXgMultiplier, isValidInstruction,
  CUT_INSIDE_WEIGHT_MUL, CUT_INSIDE_XG_MUL,
} from './playerInstructions.js';

export interface MatchSetup {
  home: { club: Club; tactic: Tactic };
  away: { club: Club; tactic: Tactic };
  seed: number;
  /** 라이벌전·컵 결승 등 — 빅게임 히어로/새가슴 특성이 파생 능력치에 반영된다. */
  isBigMatch?: boolean;
}

interface Side {
  club: Club;
  tactic: Tactic;
  strength: TeamStrength;
  isHome: boolean;
  goals: number;
  shots: number;
  possessionTicks: number;
  attackers: Player[];
}

function buildSide(
  club: Club, tactic: Tactic, isHome: boolean, isBigMatch: boolean, opponentFormation?: string,
): Side {
  const strength = computeTeamStrength(club, tactic, isBigMatch, opponentFormation);
  if (isHome) {
    // computeTeamStrength가 이미 [0,110]으로 클램프하므로, 이후 배율을 적용한 뒤
    // 다시 클램프해 문서화된 상한을 실제로 넘지 않도록 한다.
    strength.attack = clamp(strength.attack * TUNING.homeAdvantage, 0, 110);
    strength.creation = clamp(strength.creation * TUNING.homeAdvantage, 0, 110);
  }
  const byId = new Map(club.players.map((p) => [p.id, p]));
  const attackers = tactic.lineup
    .filter((s) => lineOf(s.position) === 'ATT' || lineOf(s.position) === 'MID')
    .map((s) => byId.get(s.playerId))
    .filter((p): p is Player => p !== undefined && isAvailable(p));
  return { club, tactic, strength, isHome, goals: 0, shots: 0, possessionTicks: 0, attackers };
}

/** 세트피스 상황에서 전담자가 직접 슈팅으로 이어질 확률(나머지는 크로스·코너 경합 등으로
 *  다른 선수에게 넘어감 — 100%로 몰아주면 팀 전체 세트피스 위협이 한 선수에 과도하게 종속). */
const SET_PIECE_TAKER_SHARE = 0.55;

/** 세트피스 스페셜리스트가 전담자면 몫을 더 많이 가져간다(그 외엔 기본 비율). */
const SET_PIECE_SPECIALIST_SHARE = 0.72;

/**
 * 개인 지시(F10)에 따른 슛 관여도(선택 가중치) 배수 — 좁혀 들어오기는 관여도를 높이고,
 * 전담마크에 걸리면 관여도가 줄어든다(마크맨의 marking 대 공격수의 dribbling 격차로 조정).
 */
function shooterWeight(p: Player, att: Side, def: Side): number {
  let w = 1;
  const slot = att.tactic.lineup.find((s) => s.playerId === p.id);
  if (slot?.instruction?.kind === 'cutInside' && isValidInstruction(slot.position, slot.instruction)) {
    w *= CUT_INSIDE_WEIGHT_MUL;
  }
  const marker = findManMarker(p.id, att.tactic, def.tactic, def.club.players);
  if (marker) w *= manMarkWeightMultiplier(marker, p);
  return w;
}

function pickShooter(att: Side, def: Side, rng: Rng, chance: ChanceType): Player | null {
  const available = att.club.players.filter(isAvailable);
  const pool = att.attackers.length > 0 ? att.attackers : available;
  if (pool.length === 0) return null;
  if (chance === 'setpiece' && att.tactic.setPieceTakerId) {
    const taker = pool.find((p) => p.id === att.tactic.setPieceTakerId);
    if (taker) {
      const share = hasTrait(taker, 'setPieceSpecialist') ? SET_PIECE_SPECIALIST_SHARE : SET_PIECE_TAKER_SHARE;
      if (rng.roll(share)) return taker;
    }
  }
  // 지시가 전혀 걸려있지 않으면(대다수 경기) 기존과 동일한 균등 분포·RNG 소비를 그대로 유지한다.
  const weights = pool.map((p) => shooterWeight(p, att, def));
  if (weights.every((w) => w === 1)) return pool[rng.int(0, pool.length - 1)]!;
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng.next() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return pool[i]!;
  }
  return pool[pool.length - 1]!;
}

/** 개인 지시(F10)에 따른 득점 확률 배수 — 좁혀 들어오기는 각도 개선으로 소폭 상승, 전담마크는 억제. */
function individualXgMultiplier(shooter: Player, att: Side, def: Side): number {
  let mul = 1;
  const slot = att.tactic.lineup.find((s) => s.playerId === shooter.id);
  if (slot?.instruction?.kind === 'cutInside' && isValidInstruction(slot.position, slot.instruction)) {
    mul *= CUT_INSIDE_XG_MUL;
  }
  const marker = findManMarker(shooter.id, att.tactic, def.tactic, def.club.players);
  if (marker) mul *= manMarkXgMultiplier(marker, shooter);
  return mul;
}

function pickChanceType(tactic: Tactic, rng: Rng): ChanceType {
  const r = rng.next();
  if (r < 0.12) return 'setpiece';
  if (r < 0.12 + 0.33 * (1 - tactic.tempo) + 0.10) return 'cross';
  return 'open';
}

/**
 * @param setPieceSkill 슈터의 세트피스 능력치(1~20). chance가 'setpiece'일 때만 반영 —
 *   평균치(10) 대비 마무리 배율을 소폭 보정해, 세트피스 전문가를 모으면 실제로
 *   코너·프리킥 득점력이 오르도록 한다(이전엔 이 능력치가 시뮬에 전혀 반영되지 않았음).
 */
function resolveShot(
  attack: number, gk: number, chance: ChanceType, rng: Rng, setPieceSkill?: number, individualMul = 1,
): ShotOutcome {
  const base = TUNING.baseXg[chance];
  let finishMul = (1 + (attack - 50) * TUNING.finishK) * individualMul;
  if (chance === 'setpiece' && setPieceSkill !== undefined) {
    finishMul *= 1 + (setPieceSkill - 10) * 0.025;
  }
  const gkMul = 1 + (gk - 50) * TUNING.gkK;
  const goalP = clamp((base * finishMul) / gkMul, 0.02, 0.75);
  if (rng.roll(goalP)) return 'GOAL';
  const s = TUNING.nonGoalSplit;
  const r = rng.next();
  if (r < s.save) return 'SAVE';
  if (r < s.save + s.offTarget) return 'OFF_TARGET';
  return 'BLOCKED';
}

// ── 공유 컨텍스트 ──────────────────────────────────────────

/** 한 슬롯(포지션-선수) 매핑. */
type LineupSlot = { position: Position; playerId: string };

export interface MatchContext {
  rng: Rng;
  home: Side;
  away: Side;
  events: MatchEvent[];
  statMap: Map<string, PlayerMatchStat>;
  pPossHome: number;
  seed: number;
  /** 부상 판정(킥오프 시점 라인업 기준, 고정). 하프타임/긴급 교체로도 바뀌지 않는다 —
   *  라이브 관전 중 노출한 예정 스케줄과 최종 결과가 항상 일치해야 하기 때문. */
  injuries: InjuryEvent[];
  /** 이번 경기 동안 실제로 라인업에 있었던 전원(킥오프 + 하프타임 교체로 들어온 선수 누적,
   *  선수 id 기준 중복 제거). 카드·최종 평점은 "최종 라인업"이 아니라 이 목록 기준으로
   *  집계해야, 전반에 뛰다 하프타임에 교체된 선수도 정당하게 카드·평점 대상이 되고
   *  교체 투입 선수가 풀타임을 다 뛴 것처럼 이중 보정받지 않는다. */
  playedLineups: { home: LineupSlot[]; away: LineupSlot[] };
  /** 라이벌전·컵 결승 등 — 하프타임 전술 교체로 Side가 재생성돼도 유지된다. */
  isBigMatch: boolean;
}

function recomputePossession(ctx: MatchContext): void {
  const sum = ctx.home.strength.midfield + ctx.away.strength.midfield;
  // 양팀 중원 전력이 정확히 0이면(극단적 붕괴 데이터) 50%로 폴백 — sum이 0일 때
  // 분자(0)/1로 계산하면 홈이 전 경기 동안 공을 한 번도 못 만지는 것으로 잘못 계산된다.
  ctx.pPossHome = sum > 0 ? ctx.home.strength.midfield / sum : 0.5;
}

export function createContext(setup: MatchSetup): MatchContext {
  const isBigMatch = setup.isBigMatch ?? false;
  const ctx: MatchContext = {
    rng: new Rng(setup.seed),
    home: buildSide(setup.home.club, setup.home.tactic, true, isBigMatch, setup.away.tactic.formation),
    away: buildSide(setup.away.club, setup.away.tactic, false, isBigMatch, setup.home.tactic.formation),
    events: [],
    statMap: new Map(),
    pPossHome: 0.5,
    seed: setup.seed,
    injuries: [],
    playedLineups: { home: [...setup.home.tactic.lineup], away: [...setup.away.tactic.lineup] },
    isBigMatch,
  };
  ctx.injuries = generateInjuries(ctx);
  recomputePossession(ctx);
  return ctx;
}

/** 라이브 경기에서 한 팀의 전술을 교체(하프타임 개입). 전력·점유 확률 재계산. */
export function applyTactic(ctx: MatchContext, side: 'home' | 'away', tactic: Tactic): void {
  const cur = ctx[side];
  const oppSide = side === 'home' ? 'away' : 'home';
  const next = buildSide(cur.club, tactic, cur.isHome, ctx.isBigMatch, ctx[oppSide].tactic.formation);
  // 누적 스코어/슈팅/점유 틱은 유지하고 전력·라인업만 교체
  next.goals = cur.goals;
  next.shots = cur.shots;
  next.possessionTicks = cur.possessionTicks;
  ctx[side] = next;
  // 새로 들어온 선수를 "이번 경기에 뛴 전원" 목록에 추가(중복 제거) — 교체돼 나간
  // 선수도 이미 이 목록에 있으므로 카드·평점 집계에서 계속 대상으로 남는다.
  const seen = new Set(ctx.playedLineups[side].map((s) => s.playerId));
  for (const slot of tactic.lineup) {
    if (!seen.has(slot.playerId)) {
      ctx.playedLineups[side].push(slot);
      seen.add(slot.playerId);
    }
  }
  recomputePossession(ctx);
}

function ensureStat(ctx: MatchContext, p: Player): PlayerMatchStat {
  let st = ctx.statMap.get(p.id);
  if (!st) {
    st = { playerId: p.id, name: p.name, position: p.position, rating: 6.0, shots: 0, goals: 0, assists: 0 };
    ctx.statMap.set(p.id, st);
  }
  return st;
}

/** 득점 상황(chanceType)별 어시스트가 붙을 확률 — 크로스는 거의 항상, 오픈플레이는
 *  절반 이상, 세트피스(주로 직접 프리킥)는 낮게. */
const ASSIST_CHANCE: Record<ChanceType, number> = { open: 0.65, cross: 0.88, setpiece: 0.35 };

/** 가중치 기반 무작위 선택 — 합이 0 이하면 null. */
function pickWeighted<T>(items: T[], weight: (t: T) => number, rng: Rng): T | null {
  const weights = items.map(weight);
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return null;
  let r = rng.next() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

/** 득점 시 어시스트 제공자 선정 — 시야·패스가 좋을수록, 플레이메이커 특성이 있으면 가중. */
function pickAssister(att: Side, shooter: Player, chance: ChanceType, rng: Rng): Player | null {
  if (!rng.roll(ASSIST_CHANCE[chance])) return null;
  const pool = att.club.players.filter(
    (p) => isAvailable(p) && p.position !== 'GK' && p.id !== shooter.id,
  );
  return pickWeighted(
    pool,
    (p) => 1 + (p.attributes.vision + p.attributes.passing) / 10 + (hasTrait(p, 'playmaker') ? 2 : 0),
    rng,
  );
}

/** 한 분(틱) 진행. 생성된 이벤트가 있으면 반환(없으면 null). */
export function stepMinute(ctx: MatchContext, minute: number): MatchEvent | null {
  const { rng } = ctx;
  const homeHasBall = rng.roll(ctx.pPossHome);
  const att = homeHasBall ? ctx.home : ctx.away;
  const def = homeHasBall ? ctx.away : ctx.home;
  att.possessionTicks++;

  const pAdvance = clamp(
    TUNING.advanceBase +
      TUNING.strengthSwing * (logistic(TUNING.advanceK * (att.strength.creation - def.strength.defense)) - 0.5),
    0.02, 0.95,
  );
  if (!rng.roll(pAdvance)) return null;

  const chance = pickChanceType(att.tactic, rng);

  const pShot = clamp(
    TUNING.shotBase +
      TUNING.strengthSwing * (logistic(TUNING.shotK * (att.strength.attack - def.strength.defense)) - 0.5),
    0.02, 0.95,
  );
  if (!rng.roll(pShot)) return null;

  const shooter = pickShooter(att, def, rng, chance);
  if (!shooter) return null; // 가용 선수가 전무(전원 부상·정지)한 극단적 상황 — 이번 틱은 무산
  const st = ensureStat(ctx, shooter);
  att.shots++;
  st.shots++;
  const setPieceSkill = chance === 'setpiece'
    ? shooter.attributes.setPiece + (hasTrait(shooter, 'setPieceSpecialist') ? 3 : 0)
    : undefined;
  const individualMul = individualXgMultiplier(shooter, att, def);
  const outcome = resolveShot(att.strength.attack, def.strength.gk, chance, rng, setPieceSkill, individualMul);

  let assister: Player | null = null;
  if (outcome === 'GOAL') {
    att.goals++;
    st.goals++;
    st.rating = clamp(st.rating + 1.2, 0, 10);
    assister = pickAssister(att, shooter, chance, rng);
    if (assister) {
      const ast = ensureStat(ctx, assister);
      ast.assists++;
      ast.rating = clamp(ast.rating + 0.5, 0, 10);
    }
  } else if (outcome === 'OFF_TARGET') {
    st.rating = clamp(st.rating - 0.1, 0, 10);
  }

  const ev: MatchEvent = {
    minute,
    side: homeHasBall ? 'home' : 'away',
    chanceType: chance,
    outcome,
    playerId: shooter.id,
    playerName: shooter.name,
    assistPlayerId: assister?.id,
    assistPlayerName: assister?.name,
  };
  ctx.events.push(ev);
  return ev;
}

/**
 * 출전 선수 평점 마감: 선발 전원에게 기본 평점(6.0)을 부여하고,
 * 경기 결과(승/무/패)와 실점(GK·수비 감점)을 반영한다.
 * 득점 보너스는 stepMinute에서 이미 누적됨.
 */
function finalizeRatings(ctx: MatchContext): void {
  const settle = (side: Side, sideKey: 'home' | 'away', conceded: number, resultMod: number) => {
    const byId = new Map(side.club.players.map((p) => [p.id, p]));
    // 최종(하프타임 교체 후) 라인업이 아니라 "이번 경기에 실제로 뛴 전원" 기준으로 집계 —
    // 그래야 전반에 뛰다 교체된 선수도 평점을 받고, 교체 투입 선수만 이중으로 보정받지 않는다.
    for (const slot of ctx.playedLineups[sideKey]) {
      const player = byId.get(slot.playerId);
      if (!player || !isAvailable(player)) continue;
      const st = ensureStat(ctx, player);
      let r = st.rating + resultMod;
      const line = lineOf(slot.position);
      if (line === 'GK' || line === 'DEF') r -= 0.18 * Math.max(0, conceded - 1);
      st.rating = clamp(r, 1, 10);
      if (line === 'GK') st.cleanSheet = conceded === 0;
    }
  };
  const [hg, ag] = [ctx.home.goals, ctx.away.goals];
  const mod = (gf: number, ga: number) => (gf > ga ? 0.3 : gf < ga ? -0.3 : 0);
  settle(ctx.home, 'home', ag, mod(hg, ag));
  settle(ctx.away, 'away', hg, mod(ag, hg));
}

/**
 * 카드 생성 (징계). 경기 rng와 독립된 시드로 결정론적 생성.
 * 이번 경기에 실제로 뛴 선수 전원(하프타임 교체 포함) 대상, 적극성(aggression)이
 * 높을수록 카드 확률↑.
 */
function generateCards(ctx: MatchContext): CardEvent[] {
  const cards: CardEvent[] = [];
  const rng = new Rng(ctx.seed * 3 + 12345);
  const roll = (side: Side, sideKey: 'home' | 'away') => {
    const byId = new Map(side.club.players.map((p) => [p.id, p]));
    for (const slot of ctx.playedLineups[sideKey]) {
      const p = byId.get(slot.playerId);
      if (!p || !isAvailable(p)) continue;
      const aggr = p.attributes.aggression;
      const cardMul = hasTrait(p, 'hothead') ? 1.6 : 1; // 다혈질: 카드 확률↑
      const yellowP = clamp((0.03 + (aggr - 10) * 0.006) * cardMul, 0.01, 0.16);
      const redP = clamp((0.002 + (aggr - 10) * 0.0006) * cardMul, 0.0005, 0.02);
      if (rng.roll(redP)) {
        cards.push({ minute: rng.int(20, 90), side: sideKey, playerId: p.id, playerName: p.name, type: 'red' });
      } else if (rng.roll(yellowP)) {
        cards.push({ minute: rng.int(5, 90), side: sideKey, playerId: p.id, playerName: p.name, type: 'yellow' });
      }
    }
  };
  roll(ctx.home, 'home');
  roll(ctx.away, 'away');
  return cards.sort((a, b) => a.minute - b.minute);
}

/** 의료 레벨(1~20) → 부상 발생 확률 배율. 10=1.0x, 20=0.7x, 1≈1.3x. */
function injuryMedicalFactor(medical: number): number {
  return clamp(medicalBias(medical), 0.4, 1.3);
}

/**
 * 부상 판정 (콘텐츠 심화). 경기 rng·카드 rng와 독립된 시드로 결정론적 생성 —
 * 라인업·의료·특성만의 함수라 경기 진행 상태와 무관하게 언제든 계산 가능
 * (관전 중 실시간 노출 목적). 이미 부상·정지 중인 선수는 제외.
 */
export function generateInjuries(ctx: MatchContext): InjuryEvent[] {
  const injuries: InjuryEvent[] = [];
  const rng = new Rng(ctx.seed * 11 + 24680);
  const roll = (side: Side, sideKey: 'home' | 'away') => {
    const byId = new Map(side.club.players.map((p) => [p.id, p]));
    const medical = effectiveMedical(side.club.staff);
    const medFactor = injuryMedicalFactor(medical);
    for (const slot of side.tactic.lineup) {
      const p = byId.get(slot.playerId);
      if (!p || p.injuryMatches > 0 || p.suspensionMatches > 0) continue;
      const traitMul = hasTrait(p, 'ironMan') ? 0.5 : hasTrait(p, 'injuryProne') ? 1.7 : 1;
      // 훈련 포커스를 부상방지로 맞추면(다른 능력 성장 강조는 포기하는 대가로) 부상 확률이 더 낮아진다.
      const trainingMul = p.trainingFocus === 'conditioning' ? 0.85 : 1;
      // 복귀 직후 재부상 위험 구간(REINJURY_RISK_WINDOW 경기) — 구간이 끝나갈수록 1.0으로 감쇠.
      const reinjuryMul = reinjuryRiskFactor(p.reinjuryRiskMatches);
      const injMul = traitMul * trainingMul * reinjuryMul;
      if (!rng.roll(TUNING.injuryTriggerChance * medFactor * injMul)) continue;
      const inj = rollInjury(rng, medical);
      injuries.push({
        minute: rng.int(1, 90), side: sideKey, playerId: p.id, playerName: p.name,
        severity: inj.severity, name: inj.name, bodyPart: inj.bodyPart, matches: inj.matches,
      });
    }
  };
  roll(ctx.home, 'home');
  roll(ctx.away, 'away');
  return injuries.sort((a, b) => a.minute - b.minute);
}

export function finalize(ctx: MatchContext): MatchResult {
  finalizeRatings(ctx);
  const { home, away } = ctx;
  const cards = generateCards(ctx);
  const injuries = ctx.injuries; // 킥오프 시점에 확정(생성 시점 무관하게 항상 동일)
  const totalTicks = home.possessionTicks + away.possessionTicks || 1;
  const possession: [number, number] = [
    Math.round((home.possessionTicks / totalTicks) * 100),
    Math.round((away.possessionTicks / totalTicks) * 100),
  ];
  const splitStats = (club: Club): PlayerMatchStat[] =>
    club.players
      .map((p) => ctx.statMap.get(p.id))
      .filter((s): s is PlayerMatchStat => Boolean(s));
  const homeStats = splitStats(home.club);
  const awayStats = splitStats(away.club);
  // 맨오브더매치: 양 팀 통틀어 평점(동률이면 득점) 최고 — 이미 계산된 statMap의 순수 파생.
  const motm = [...homeStats, ...awayStats]
    .sort((a, b) => b.rating - a.rating || b.goals - a.goals)[0];

  return {
    homeClubId: home.club.id,
    awayClubId: away.club.id,
    homeClubName: home.club.name,
    awayClubName: away.club.name,
    score: [home.goals, away.goals],
    possession,
    shots: [home.shots, away.shots],
    events: ctx.events,
    cards,
    injuries,
    playerStats: { home: homeStats, away: awayStats },
    seed: ctx.seed,
    motmPlayerId: motm?.playerId,
  };
}

export const MATCH_LENGTH = TUNING.matchLength;

/** 일괄 시뮬: 컨텍스트 생성 → 전 분 진행 → 마무리. */
export function simulateMatch(setup: MatchSetup): MatchResult {
  const ctx = createContext(setup);
  for (let minute = 1; minute <= TUNING.matchLength; minute++) {
    stepMinute(ctx, minute);
  }
  return finalize(ctx);
}
