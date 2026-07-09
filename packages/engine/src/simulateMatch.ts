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
import { rollInjury, medicalBias, reinjuryRiskFactor, fatigueRiskFactor, chronicInjuryFactor } from './injury.js';
import { effectiveMedical } from './staffActions.js';
import { trainingGroundInjuryFactor, STADIUM_MAX } from './finance.js';
import {
  findManMarker, manMarkWeightMultiplier, manMarkXgMultiplier, isValidInstruction,
  CUT_INSIDE_WEIGHT_MUL, CUT_INSIDE_XG_MUL,
} from './playerInstructions.js';
import { matchWeather, WEATHER_ATTACK_MULTIPLIER, WEATHER_CREATION_MULTIPLIER, type Weather } from './weather.js';
import { matchRefereeStrictness, REFEREE_CARD_MULTIPLIER, type RefereeStrictness } from './referee.js';

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

/** 스타디움 등급이 이 값일 때 관중 규모로 인한 추가 보너스가 0(기존 고정 배율과 동일). */
const STADIUM_NEUTRAL_LEVEL = 0;
/** 팬 만족도가 이 값일 때 분위기로 인한 추가 보너스가 0 — FAN_SATISFACTION_DEFAULT와 맞춰
 *  구버전 세이브·신규 구단(둘 다 기본값)에서 기존 고정 배율(1.06)과 완전히 동일하게 동작한다. */
const FAN_NEUTRAL_SATISFACTION = 60;

/**
 * 관중 수·팬 만족도 연동 홈 어드밴티지(고도화 항목43) — 스타디움이 클수록,
 * 팬 만족도가 높을수록 관중의 응원 효과가 커진다는 가정으로 기존 고정 배율(1.06)에
 * 소폭 가감한다. 스타디움 등급 0·팬 만족도 60(둘 다 기본값)이면 보정치가 정확히
 * 0이 되어 구버전 세이브·신규 구단에서 기존 동작과 100% 동일하다.
 */
export function dynamicHomeAdvantage(club: Club): number {
  const stadiumLevel = clamp(club.finance.stadiumLevel ?? STADIUM_NEUTRAL_LEVEL, 0, STADIUM_MAX);
  const fanSatisfaction = clamp(club.finance.fanSatisfaction ?? FAN_NEUTRAL_SATISFACTION, 0, 100);
  const stadiumBonus = (stadiumLevel / STADIUM_MAX) * 0.03;
  const fanBonus = ((fanSatisfaction - FAN_NEUTRAL_SATISFACTION) / 100) * 0.04;
  return clamp(TUNING.homeAdvantage + stadiumBonus + fanBonus, 1.0, 1.12);
}

function buildSide(
  club: Club, tactic: Tactic, isHome: boolean, isBigMatch: boolean, opponentFormation?: string,
  weather: Weather = 'clear',
): Side {
  const strength = computeTeamStrength(club, tactic, isBigMatch, opponentFormation);
  if (isHome) {
    // computeTeamStrength가 이미 [0,110]으로 클램프하므로, 이후 배율을 적용한 뒤
    // 다시 클램프해 문서화된 상한을 실제로 넘지 않도록 한다.
    const homeAdvantage = dynamicHomeAdvantage(club);
    strength.attack = clamp(strength.attack * homeAdvantage, 0, 110);
    strength.creation = clamp(strength.creation * homeAdvantage, 0, 110);
  }
  // 날씨(신규 개선 항목 26) — 양 팀 모두에게 동일하게 적용(홈 이점과 별개로 곱산).
  strength.attack = clamp(strength.attack * WEATHER_ATTACK_MULTIPLIER[weather], 0, 110);
  strength.creation = clamp(strength.creation * WEATHER_CREATION_MULTIPLIER[weather], 0, 110);
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

function pickShooter(att: Side, def: Side, rng: Rng, chance: ChanceType, sentOff: Set<string>): Player | null {
  const available = att.club.players.filter((p) => isAvailable(p) && !sentOff.has(p.id));
  const attackersOnField = att.attackers.filter((p) => !sentOff.has(p.id));
  const pool = attackersOnField.length > 0 ? attackersOnField : available;
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
/** 이 득점확률(goalP) 이상인 슈팅은 "빅찬스"로 분류한다(고도화 항목45). 일반적인
 *  매치업에서 goalP 분포가 대략 0.08~0.17 사이에 몰려 있어(평균 클럽 기준 실측),
 *  상위 구간(대략 p70 이상)에 해당하는 값으로 보정 — 전력차가 있거나 개인 특성이
 *  붙어 평균보다 뚜렷이 좋은 기회만 포함되도록 한다. */
const BIG_CHANCE_GOAL_P_THRESHOLD = 0.14;

interface ResolvedShot {
  outcome: ShotOutcome;
  /** 이 슈팅의 최종 득점확률(고도화 항목45, 빅찬스 판정용). */
  goalP: number;
}

/**
 * @param ownGoalShare 자책골로 재분류할 확률 몫(고도화 항목42) — BLOCKED 몫에서
 *   떼어낸다. 같은 r 굴림을 그대로 재사용하므로 RNG 소비량은 늘지 않는다
 *   (자책골이 실제로 나온 경우에만 이후 별도 처리에서 추가 로직이 붙는다).
 */
function resolveShot(
  attack: number, gk: number, chance: ChanceType, rng: Rng, setPieceSkill?: number, individualMul = 1,
  ownGoalShare = 0,
): ResolvedShot {
  const base = TUNING.baseXg[chance];
  let finishMul = (1 + (attack - 50) * TUNING.finishK) * individualMul;
  if (chance === 'setpiece' && setPieceSkill !== undefined) {
    finishMul *= 1 + (setPieceSkill - 10) * 0.025;
  }
  const gkMul = 1 + (gk - 50) * TUNING.gkK;
  const goalP = clamp((base * finishMul) / gkMul, 0.02, 0.75);
  if (rng.roll(goalP)) return { outcome: 'GOAL', goalP };
  const s = TUNING.nonGoalSplit;
  const r = rng.next();
  if (r < s.save) return { outcome: 'SAVE', goalP };
  if (r < s.save + s.offTarget) return { outcome: 'OFF_TARGET', goalP };
  if (r < s.save + s.offTarget + ownGoalShare) return { outcome: 'OWN_GOAL', goalP };
  return { outcome: 'BLOCKED', goalP };
}

/** 자책골 기본 확률 몫(BLOCKED 몫 중 일부, 고도화 항목42) — 수비 책임자의
 *  decisions/positioning이 낮을수록 배율로 확대된다. */
const OWN_GOAL_BASE_SHARE = 0.01;

/**
 * 수비진 중 decisions·positioning 평균이 가장 낮은(실점 유발 위험이 가장 큰) 선수를
 * 결정론적으로 골라 자책골 책임을 귀속시킨다(고도화 항목42) — 무작위 추첨이 아니라
 * 라인업만의 함수라 추가 RNG 소비가 없다. DEF 라인 출전자가 없으면(극단적 포메이션)
 * GK를 제외한 출전 전원 중에서 고른다.
 */
export function weakestDefender(def: Side): Player | null {
  const byId = new Map(def.club.players.map((p) => [p.id, p]));
  const defenders = def.tactic.lineup
    .filter((s) => lineOf(s.position) === 'DEF')
    .map((s) => byId.get(s.playerId))
    .filter((p): p is Player => p !== undefined && isAvailable(p));
  const pool = defenders.length > 0
    ? defenders
    : def.club.players.filter((p) => isAvailable(p) && p.position !== 'GK');
  if (pool.length === 0) return null;
  const errorScore = (p: Player) => (p.attributes.decisions + p.attributes.positioning) / 2;
  return pool.reduce((worst, p) => (errorScore(p) < errorScore(worst) ? p : worst));
}

/** decisions·positioning 평균이 낮을수록 자책골 몫을 확대하는 배율(0.5~2.0배). */
export function ownGoalRiskMultiplier(p: Player): number {
  const avg = (p.attributes.decisions + p.attributes.positioning) / 2;
  return clamp((20 - avg) / 10, 0.5, 2);
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
  /** 카드 판정(킥오프 시점 라인업 기준, 고정 — 부상과 동일 패턴). 레드카드는 stepMinute이
   *  그 분(minute)부터 실시간으로 참조해 인원수 열세를 전력에 반영한다(고도화 항목41). */
  cards: CardEvent[];
  /** 이번 경기 동안 실제로 라인업에 있었던 전원(킥오프 + 하프타임 교체로 들어온 선수 누적,
   *  선수 id 기준 중복 제거). 카드·최종 평점은 "최종 라인업"이 아니라 이 목록 기준으로
   *  집계해야, 전반에 뛰다 하프타임에 교체된 선수도 정당하게 카드·평점 대상이 되고
   *  교체 투입 선수가 풀타임을 다 뛴 것처럼 이중 보정받지 않는다. */
  playedLineups: { home: LineupSlot[]; away: LineupSlot[] };
  /** 라이벌전·컵 결승 등 — 하프타임 전술 교체로 Side가 재생성돼도 유지된다. */
  isBigMatch: boolean;
  /** 경기 날씨(신규 개선 항목 26) — 킥오프 시점에 결정, 하프타임 전술 교체로도 바뀌지 않는다. */
  weather: Weather;
  /** 이 경기의 심판 엄격도(고도화 항목46) — 킥오프 시점에 결정, 카드 확률 배율에 반영. */
  refereeStrictness: RefereeStrictness;
}

function recomputePossession(ctx: MatchContext): void {
  const sum = ctx.home.strength.midfield + ctx.away.strength.midfield;
  // 양팀 중원 전력이 정확히 0이면(극단적 붕괴 데이터) 50%로 폴백 — sum이 0일 때
  // 분자(0)/1로 계산하면 홈이 전 경기 동안 공을 한 번도 못 만지는 것으로 잘못 계산된다.
  ctx.pPossHome = sum > 0 ? ctx.home.strength.midfield / sum : 0.5;
}

export function createContext(setup: MatchSetup): MatchContext {
  const isBigMatch = setup.isBigMatch ?? false;
  const weather = matchWeather(setup.seed, setup.home.club.id, setup.away.club.id);
  const refereeStrictness = matchRefereeStrictness(setup.seed, setup.home.club.id, setup.away.club.id);
  const ctx: MatchContext = {
    rng: new Rng(setup.seed),
    home: buildSide(setup.home.club, setup.home.tactic, true, isBigMatch, setup.away.tactic.formation, weather),
    away: buildSide(setup.away.club, setup.away.tactic, false, isBigMatch, setup.home.tactic.formation, weather),
    events: [],
    statMap: new Map(),
    pPossHome: 0.5,
    seed: setup.seed,
    injuries: [],
    cards: [],
    playedLineups: { home: [...setup.home.tactic.lineup], away: [...setup.away.tactic.lineup] },
    isBigMatch,
    weather,
    refereeStrictness,
  };
  ctx.injuries = generateInjuries(ctx);
  // 카드도 부상과 마찬가지로 킥오프 라인업 기준 고정 — 이 시점의 playedLineups는 아직
  // 하프타임 교체가 반영되기 전이라 자연히 선발 XI만 대상이 된다.
  ctx.cards = generateCards(ctx);
  recomputePossession(ctx);
  return ctx;
}

/** 라이브 경기에서 한 팀의 전술을 교체(하프타임 개입). 전력·점유 확률 재계산. */
export function applyTactic(ctx: MatchContext, side: 'home' | 'away', tactic: Tactic): void {
  const cur = ctx[side];
  const oppSide = side === 'home' ? 'away' : 'home';
  const next = buildSide(cur.club, tactic, cur.isHome, ctx.isBigMatch, ctx[oppSide].tactic.formation, ctx.weather);
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
function pickAssister(att: Side, shooter: Player, chance: ChanceType, rng: Rng, sentOff: Set<string>): Player | null {
  if (!rng.roll(ASSIST_CHANCE[chance])) return null;
  const pool = att.club.players.filter(
    (p) => isAvailable(p) && p.position !== 'GK' && p.id !== shooter.id && !sentOff.has(p.id),
  );
  return pickWeighted(
    pool,
    (p) => 1 + (p.attributes.vision + p.attributes.passing) / 10 + (hasTrait(p, 'playmaker') ? 2 : 0),
    rng,
  );
}

/** 레드카드 1장당 팀 전력(공격·창조력·수비) 배율(고도화 항목41) — 인원수 열세를
 *  단순화해 균일 배율로 반영한다. 드물게 2장 이상 나오면 거듭 곱해진다. */
const RED_CARD_STRENGTH_MULTIPLIER = 0.88;

/** 특정 분(minute) 시점까지 side에 발생한 레드카드로 퇴장한 선수 id 집합. */
function sentOffIds(cards: CardEvent[], side: 'home' | 'away', minute: number): Set<string> {
  const ids = new Set<string>();
  for (const c of cards) {
    if (c.type === 'red' && c.side === side && c.minute <= minute) ids.add(c.playerId);
  }
  return ids;
}

export function manDownMultiplier(sentOffCount: number): number {
  return sentOffCount > 0 ? Math.pow(RED_CARD_STRENGTH_MULTIPLIER, sentOffCount) : 1;
}

/** 한 분(틱) 진행. 생성된 이벤트가 있으면 반환(없으면 null). */
export function stepMinute(ctx: MatchContext, minute: number): MatchEvent | null {
  const { rng } = ctx;
  const homeHasBall = rng.roll(ctx.pPossHome);
  const att = homeHasBall ? ctx.home : ctx.away;
  const def = homeHasBall ? ctx.away : ctx.home;
  att.possessionTicks++;

  const attSentOff = sentOffIds(ctx.cards, homeHasBall ? 'home' : 'away', minute);
  const defSentOff = sentOffIds(ctx.cards, homeHasBall ? 'away' : 'home', minute);
  const attMul = manDownMultiplier(attSentOff.size);
  const defMul = manDownMultiplier(defSentOff.size);
  const attAttack = att.strength.attack * attMul;
  const attCreation = att.strength.creation * attMul;
  const defDefense = def.strength.defense * defMul;

  const pAdvance = clamp(
    TUNING.advanceBase +
      TUNING.strengthSwing * (logistic(TUNING.advanceK * (attCreation - defDefense)) - 0.5),
    0.02, 0.95,
  );
  if (!rng.roll(pAdvance)) return null;

  const chance = pickChanceType(att.tactic, rng);

  const pShot = clamp(
    TUNING.shotBase +
      TUNING.strengthSwing * (logistic(TUNING.shotK * (attAttack - defDefense)) - 0.5),
    0.02, 0.95,
  );
  if (!rng.roll(pShot)) return null;

  const shooter = pickShooter(att, def, rng, chance, attSentOff);
  if (!shooter) return null; // 가용 선수가 전무(전원 부상·정지·퇴장)한 극단적 상황 — 이번 틱은 무산
  const st = ensureStat(ctx, shooter);
  att.shots++;
  st.shots++;
  const setPieceSkill = chance === 'setpiece'
    ? shooter.attributes.setPiece + (hasTrait(shooter, 'setPieceSpecialist') ? 3 : 0)
    : undefined;
  const individualMul = individualXgMultiplier(shooter, att, def);
  // 자책골(고도화 항목42) 몫 — 수비 라인 중 가장 실점 유발 위험이 큰 선수의 특성으로 확대.
  const defErrorProne = weakestDefender(def);
  const ownGoalShare = defErrorProne ? OWN_GOAL_BASE_SHARE * ownGoalRiskMultiplier(defErrorProne) : 0;
  const { outcome, goalP } = resolveShot(attAttack, def.strength.gk, chance, rng, setPieceSkill, individualMul, ownGoalShare);

  // 빅찬스 생성/실축 집계(고도화 항목45) — 이미 계산된 goalP를 읽기만 하므로 추가 RNG
  // 소비 없음. 자책골은 슈터 본인의 마무리 실력과 무관해 집계에서 제외한다.
  const isBigChance = goalP >= BIG_CHANCE_GOAL_P_THRESHOLD;
  if (isBigChance && outcome !== 'OWN_GOAL') {
    st.bigChancesCreated = (st.bigChancesCreated ?? 0) + 1;
    if (outcome !== 'GOAL') st.bigChancesMissed = (st.bigChancesMissed ?? 0) + 1;
  }

  let assister: Player | null = null;
  let eventPlayerId = shooter.id;
  let eventPlayerName = shooter.name;
  if (outcome === 'GOAL') {
    att.goals++;
    st.goals++;
    st.rating = clamp(st.rating + 1.2, 0, 10);
    assister = pickAssister(att, shooter, chance, rng, attSentOff);
    if (assister) {
      const ast = ensureStat(ctx, assister);
      ast.assists++;
      ast.rating = clamp(ast.rating + 0.5, 0, 10);
    }
  } else if (outcome === 'OWN_GOAL') {
    // 자책골: 득점은 공격 측(att)에 귀속되지만, 득점 주체는 수비 측(def) 선수다.
    // 원래 슈터는 자기 득점·평점 보너스를 받지 않는다(단순히 상황을 만든 것뿐).
    att.goals++;
    const og = ensureStat(ctx, defErrorProne!);
    og.ownGoals = (og.ownGoals ?? 0) + 1;
    og.rating = clamp(og.rating - 1.0, 0, 10);
    eventPlayerId = defErrorProne!.id;
    eventPlayerName = defErrorProne!.name;
  } else if (outcome === 'OFF_TARGET') {
    st.rating = clamp(st.rating - 0.1, 0, 10);
  }

  const ev: MatchEvent = {
    minute,
    side: homeHasBall ? 'home' : 'away',
    chanceType: chance,
    outcome,
    playerId: eventPlayerId,
    playerName: eventPlayerName,
    assistPlayerId: assister?.id,
    assistPlayerName: assister?.name,
    isOwnGoal: outcome === 'OWN_GOAL' ? true : undefined,
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
/**
 * 카드 판정 — 부상과 동일하게 킥오프 시점(ctx.playedLineups가 아직 선발 XI만
 * 담고 있을 때)에 한 번만 계산해 ctx.cards에 고정한다(고도화 항목41). 레드카드는
 * stepMinute이 해당 분(minute)부터 실시간으로 참조해 인원수 열세를 전력에 반영한다.
 * 심판 엄격도(고도화 항목46)는 카드 확률 전체에 배율로만 반영 — 독립 RNG 스트림의
 * 굴림 횟수·순서는 그대로다.
 */
function generateCards(ctx: MatchContext): CardEvent[] {
  const cards: CardEvent[] = [];
  const rng = new Rng(ctx.seed * 3 + 12345);
  const refereeMul = REFEREE_CARD_MULTIPLIER[ctx.refereeStrictness];
  const roll = (side: Side, sideKey: 'home' | 'away') => {
    const byId = new Map(side.club.players.map((p) => [p.id, p]));
    for (const slot of ctx.playedLineups[sideKey]) {
      const p = byId.get(slot.playerId);
      if (!p || !isAvailable(p)) continue;
      const aggr = p.attributes.aggression;
      const cardMul = hasTrait(p, 'hothead') ? 1.6 : 1; // 다혈질: 카드 확률↑
      const yellowP = clamp((0.03 + (aggr - 10) * 0.006) * cardMul * refereeMul, 0.01, 0.16);
      const redP = clamp((0.002 + (aggr - 10) * 0.0006) * cardMul * refereeMul, 0.0005, 0.02);
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
    // 훈련장(피지컬 트레이닝) 시설 등급(신규 개선 항목 21) — 의료 스태프(인력)와 별개로
    // 시설(자본재) 투자분만큼 부상 확률을 추가로 낮춘다.
    const facilityFactor = trainingGroundInjuryFactor(side.club.finance.trainingGroundLevel);
    for (const slot of side.tactic.lineup) {
      const p = byId.get(slot.playerId);
      if (!p || p.injuryMatches > 0 || p.suspensionMatches > 0) continue;
      const traitMul = hasTrait(p, 'ironMan') ? 0.5 : hasTrait(p, 'injuryProne') ? 1.7 : 1;
      // 훈련 포커스를 부상방지로 맞추면(다른 능력 성장 강조는 포기하는 대가로) 부상 확률이 더 낮아진다.
      const trainingMul = p.trainingFocus === 'conditioning' ? 0.85 : 1;
      // 복귀 직후 재부상 위험 구간(REINJURY_RISK_WINDOW 경기) — 구간이 끝나갈수록 1.0으로 감쇠.
      const reinjuryMul = reinjuryRiskFactor(p.reinjuryRiskMatches);
      // 지친(컨디션 낮은) 선수는 부상 위험이 더 크다(고도화 항목28).
      const fatigueMul = fatigueRiskFactor(p.condition);
      // 통산 부상이 잦았던 선수는 앞으로도 부상 위험이 더 크다(고도화 항목29).
      const chronicMul = chronicInjuryFactor(p.careerInjuryCount ?? 0);
      const injMul = traitMul * trainingMul * reinjuryMul * fatigueMul * chronicMul;
      if (!rng.roll(TUNING.injuryTriggerChance * medFactor * facilityFactor * injMul)) continue;
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
  const cards = ctx.cards; // 킥오프 시점에 확정(고도화 항목41 — stepMinute이 이미 실시간 참조)
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
    weather: ctx.weather,
    refereeStrictness: ctx.refereeStrictness,
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
