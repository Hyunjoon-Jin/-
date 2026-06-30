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
  ChanceType, Club, MatchEvent, MatchResult, Player,
  PlayerMatchStat, ShotOutcome, Tactic, TeamStrength,
} from './types.js';
import { computeTeamStrength, lineOf } from './teamStrength.js';
import { Rng } from './rng.js';
import { clamp, logistic } from './math.js';
import { TUNING } from './tuning.js';

export interface MatchSetup {
  home: { club: Club; tactic: Tactic };
  away: { club: Club; tactic: Tactic };
  seed: number;
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

function buildSide(club: Club, tactic: Tactic, isHome: boolean): Side {
  const strength = computeTeamStrength(club, tactic);
  if (isHome) {
    strength.attack *= TUNING.homeAdvantage;
    strength.creation *= TUNING.homeAdvantage;
  }
  const byId = new Map(club.players.map((p) => [p.id, p]));
  const attackers = tactic.lineup
    .filter((s) => lineOf(s.position) === 'ATT' || lineOf(s.position) === 'MID')
    .map((s) => byId.get(s.playerId))
    .filter((p): p is Player => Boolean(p));
  return { club, tactic, strength, isHome, goals: 0, shots: 0, possessionTicks: 0, attackers };
}

function pickShooter(side: Side, rng: Rng): Player {
  const pool = side.attackers.length > 0 ? side.attackers : side.club.players;
  return pool[rng.int(0, pool.length - 1)]!;
}

function pickChanceType(tactic: Tactic, rng: Rng): ChanceType {
  const r = rng.next();
  if (r < 0.12) return 'setpiece';
  if (r < 0.12 + 0.33 * (1 - tactic.tempo) + 0.10) return 'cross';
  return 'open';
}

function resolveShot(attack: number, gk: number, chance: ChanceType, rng: Rng): ShotOutcome {
  const base = TUNING.baseXg[chance];
  const finishMul = 1 + (attack - 50) * TUNING.finishK;
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

export interface MatchContext {
  rng: Rng;
  home: Side;
  away: Side;
  events: MatchEvent[];
  statMap: Map<string, PlayerMatchStat>;
  pPossHome: number;
  seed: number;
}

function recomputePossession(ctx: MatchContext): void {
  ctx.pPossHome =
    ctx.home.strength.midfield / (ctx.home.strength.midfield + ctx.away.strength.midfield || 1);
}

export function createContext(setup: MatchSetup): MatchContext {
  const ctx: MatchContext = {
    rng: new Rng(setup.seed),
    home: buildSide(setup.home.club, setup.home.tactic, true),
    away: buildSide(setup.away.club, setup.away.tactic, false),
    events: [],
    statMap: new Map(),
    pPossHome: 0.5,
    seed: setup.seed,
  };
  recomputePossession(ctx);
  return ctx;
}

/** 라이브 경기에서 한 팀의 전술을 교체(하프타임 개입). 전력·점유 확률 재계산. */
export function applyTactic(ctx: MatchContext, side: 'home' | 'away', tactic: Tactic): void {
  const cur = ctx[side];
  const next = buildSide(cur.club, tactic, cur.isHome);
  // 누적 스코어/슈팅/점유 틱은 유지하고 전력·라인업만 교체
  next.goals = cur.goals;
  next.shots = cur.shots;
  next.possessionTicks = cur.possessionTicks;
  ctx[side] = next;
  recomputePossession(ctx);
}

function ensureStat(ctx: MatchContext, p: Player): PlayerMatchStat {
  let st = ctx.statMap.get(p.id);
  if (!st) {
    st = { playerId: p.id, name: p.name, rating: 6.0, shots: 0, goals: 0 };
    ctx.statMap.set(p.id, st);
  }
  return st;
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
      0.5 * (logistic(TUNING.advanceK * (att.strength.creation - def.strength.defense)) - 0.5),
    0.02, 0.95,
  );
  if (!rng.roll(pAdvance)) return null;

  const chance = pickChanceType(att.tactic, rng);

  const pShot = clamp(
    TUNING.shotBase +
      0.5 * (logistic(TUNING.shotK * (att.strength.attack - def.strength.defense)) - 0.5),
    0.02, 0.95,
  );
  if (!rng.roll(pShot)) return null;

  const shooter = pickShooter(att, rng);
  const st = ensureStat(ctx, shooter);
  att.shots++;
  st.shots++;
  const outcome = resolveShot(att.strength.attack, def.strength.gk, chance, rng);

  if (outcome === 'GOAL') {
    att.goals++;
    st.goals++;
    st.rating = clamp(st.rating + 1.2, 0, 10);
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
  const settle = (side: Side, conceded: number, resultMod: number) => {
    const byId = new Map(side.club.players.map((p) => [p.id, p]));
    for (const slot of side.tactic.lineup) {
      const player = byId.get(slot.playerId);
      if (!player || player.injuryMatches > 0) continue;
      const st = ensureStat(ctx, player);
      let r = st.rating + resultMod;
      const line = lineOf(slot.position);
      if (line === 'GK' || line === 'DEF') r -= 0.18 * Math.max(0, conceded - 1);
      st.rating = clamp(r, 1, 10);
    }
  };
  const [hg, ag] = [ctx.home.goals, ctx.away.goals];
  const mod = (gf: number, ga: number) => (gf > ga ? 0.3 : gf < ga ? -0.3 : 0);
  settle(ctx.home, ag, mod(hg, ag));
  settle(ctx.away, hg, mod(ag, hg));
}

export function finalize(ctx: MatchContext): MatchResult {
  finalizeRatings(ctx);
  const { home, away } = ctx;
  const totalTicks = home.possessionTicks + away.possessionTicks || 1;
  const possession: [number, number] = [
    Math.round((home.possessionTicks / totalTicks) * 100),
    Math.round((away.possessionTicks / totalTicks) * 100),
  ];
  const splitStats = (club: Club): PlayerMatchStat[] =>
    club.players
      .map((p) => ctx.statMap.get(p.id))
      .filter((s): s is PlayerMatchStat => Boolean(s));

  return {
    homeClubId: home.club.id,
    awayClubId: away.club.id,
    homeClubName: home.club.name,
    awayClubName: away.club.name,
    score: [home.goals, away.goals],
    possession,
    shots: [home.shots, away.shots],
    events: ctx.events,
    playerStats: { home: splitStats(home.club), away: splitStats(away.club) },
    seed: ctx.seed,
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
