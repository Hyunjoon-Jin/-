/**
 * 틱 기반 경기 시뮬레이션 (engine.md 4장).
 * 점유 → 전진 → 슈팅 → 결과 순서로 매 분 확률 판정.
 * 시드 고정 시 완전 재현 가능.
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
  /** 슈팅 후보(전방·중원) — 골 기여 배분용. */
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
  return {
    club, tactic, strength, isHome,
    goals: 0, shots: 0, possessionTicks: 0,
    attackers,
  };
}

/** 공격 기여 가중 선택: 전방일수록 골 확률↑ (attack 파생값 가중). */
function pickShooter(side: Side, rng: Rng): Player {
  const pool = side.attackers.length > 0 ? side.attackers : side.club.players;
  // 공격 라인업 인덱스가 뒤일수록(=ST 쪽) 가중 부여. 단순화: 균등에 약간의 무작위.
  return pool[rng.int(0, pool.length - 1)]!;
}

function pickChanceType(tactic: Tactic, rng: Rng): ChanceType {
  // 측면 지향(가정: tempo 높을수록 빠른 전개=오픈, 낮으면 크로스 비중↑) + 세트피스 고정 비율.
  const r = rng.next();
  if (r < 0.12) return 'setpiece';
  if (r < 0.12 + 0.33 * (1 - tactic.tempo) + 0.10) return 'cross';
  return 'open';
}

function resolveShot(
  attack: number, gk: number, chance: ChanceType, rng: Rng,
): ShotOutcome {
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

export function simulateMatch(setup: MatchSetup): MatchResult {
  const rng = new Rng(setup.seed);
  const home = buildSide(setup.home.club, setup.home.tactic, true);
  const away = buildSide(setup.away.club, setup.away.tactic, false);

  const events: MatchEvent[] = [];
  const statMap = new Map<string, PlayerMatchStat>();

  const ensureStat = (p: Player): PlayerMatchStat => {
    let st = statMap.get(p.id);
    if (!st) {
      st = { playerId: p.id, name: p.name, rating: 6.0, shots: 0, goals: 0 };
      statMap.set(p.id, st);
    }
    return st;
  };

  const pPossHome =
    home.strength.midfield / (home.strength.midfield + away.strength.midfield || 1);

  for (let minute = 1; minute <= TUNING.matchLength; minute++) {
    const homeHasBall = rng.roll(pPossHome);
    const att = homeHasBall ? home : away;
    const def = homeHasBall ? away : home;
    att.possessionTicks++;

    // (b) 전진 시도
    const pAdvance = clamp(
      TUNING.advanceBase +
        0.5 * (logistic(TUNING.advanceK * (att.strength.creation - def.strength.defense)) - 0.5),
      0.02, 0.95,
    );
    if (!rng.roll(pAdvance)) continue;

    // (c) 기회 유형
    const chance = pickChanceType(att.tactic, rng);

    // (d) 슈팅 발생
    const pShot = clamp(
      TUNING.shotBase +
        0.5 * (logistic(TUNING.shotK * (att.strength.attack - def.strength.defense)) - 0.5),
      0.02, 0.95,
    );
    if (!rng.roll(pShot)) continue;

    // (e) 슛 결과
    const shooter = pickShooter(att, rng);
    const st = ensureStat(shooter);
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

    events.push({
      minute,
      side: homeHasBall ? 'home' : 'away',
      chanceType: chance,
      outcome,
      playerId: shooter.id,
      playerName: shooter.name,
    });
  }

  const totalTicks = home.possessionTicks + away.possessionTicks || 1;
  const possession: [number, number] = [
    Math.round((home.possessionTicks / totalTicks) * 100),
    Math.round((away.possessionTicks / totalTicks) * 100),
  ];

  const splitStats = (club: Club): PlayerMatchStat[] =>
    club.players
      .map((p) => statMap.get(p.id))
      .filter((s): s is PlayerMatchStat => Boolean(s));

  return {
    homeClubId: home.club.id,
    awayClubId: away.club.id,
    homeClubName: home.club.name,
    awayClubName: away.club.name,
    score: [home.goals, away.goals],
    possession,
    shots: [home.shots, away.shots],
    events,
    playerStats: { home: splitStats(home.club), away: splitStats(away.club) },
    seed: setup.seed,
  };
}
