/**
 * 경기 후 선수 상태 변화 (콘텐츠 심화: 피로·부상·사기).
 * 경기를 뛴 선수는 피로가 쌓이고, 벤치는 회복한다. 일정 확률로 부상.
 * 승패는 사기에 반영된다. 모두 시드 기반 → 재현성 유지.
 */
import type { Club, MatchResult, Tactic } from './types.js';
import { Rng } from './rng.js';
import { clamp } from './math.js';

const TUNING = {
  /** 선발 출전 시 기본 컨디션 하락(스태미너로 경감). */
  fatigueBase: 0.08,
  /** 벤치 선수 경기당 회복(자연회복으로 증가). */
  recoveryBase: 0.22,
  /** 컨디션 하한. */
  minCondition: 0.35,
  /** 선발당 경기당 부상 확률. */
  injuryChance: 0.007,
  /** 부상 복귀 시 컨디션. */
  returnCondition: 0.65,
  /** 승/패 사기 변동. */
  moraleWin: 0.06,
  moraleLoss: 0.06,
} as const;

type Outcome = 'W' | 'D' | 'L';

function applySide(club: Club, tactic: Tactic, outcome: Outcome, rng: Rng): void {
  const starters = new Set(tactic.lineup.map((s) => s.playerId));
  const dMorale = outcome === 'W' ? TUNING.moraleWin : outcome === 'L' ? -TUNING.moraleLoss : 0;

  for (const p of club.players) {
    if (p.injuryMatches > 0) {
      // 부상 회복 카운트다운 (출전/피로 없음)
      p.injuryMatches--;
      if (p.injuryMatches === 0) p.condition = Math.max(p.condition, TUNING.returnCondition);
    } else if (starters.has(p.id)) {
      // 선발: 피로 누적 (스태미너 높을수록 덜 지침)
      const fatigue = TUNING.fatigueBase * (1 - p.attributes.stamina / 40);
      p.condition = Math.max(TUNING.minCondition, p.condition - fatigue);
      // 부상 판정
      if (rng.roll(TUNING.injuryChance)) {
        p.injuryMatches = rng.int(2, 8);
        p.condition = 0.3;
      }
    } else {
      // 벤치/로테이션: 회복 (자연회복 높을수록 빠름)
      const recovery = TUNING.recoveryBase * (0.5 + p.attributes.naturalFitness / 20);
      p.condition = Math.min(1, p.condition + recovery);
    }
    p.morale = clamp(p.morale + dMorale, 0, 1);
  }
}

/**
 * 경기 결과를 양 구단 선수 상태에 반영.
 * @param rng 시드 고정 난수(경기마다 별도 스트림).
 */
export function applyMatchEffects(
  home: Club, homeTactic: Tactic,
  away: Club, awayTactic: Tactic,
  result: MatchResult, rng: Rng,
): void {
  const [hg, ag] = result.score;
  const homeOutcome: Outcome = hg > ag ? 'W' : hg < ag ? 'L' : 'D';
  const awayOutcome: Outcome = ag > hg ? 'W' : ag < hg ? 'L' : 'D';
  applySide(home, homeTactic, homeOutcome, rng);
  applySide(away, awayTactic, awayOutcome, rng);
}
