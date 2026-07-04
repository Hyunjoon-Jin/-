/**
 * 경기 후 선수 상태 변화 (콘텐츠 심화: 피로·부상·사기).
 * 경기를 뛴 선수는 피로가 쌓이고, 벤치는 회복한다. 부상은 simulateMatch에서
 * 이미 판정(result.injuries)돼 여기서는 그 결과를 적용만 한다.
 * 승패는 사기에 반영된다. 모두 시드 기반 → 재현성 유지.
 */
import type { Club, InjuryEvent, MatchResult, Tactic } from './types.js';
import type { Rng } from './rng.js';
import { clamp } from './math.js';
import { hasTrait } from './traits.js';

const TUNING = {
  /** 선발 출전 시 기본 컨디션 하락(스태미너로 경감). */
  fatigueBase: 0.08,
  /** 벤치 선수 경기당 회복(자연회복으로 증가). */
  recoveryBase: 0.22,
  /** 컨디션 하한. */
  minCondition: 0.35,
  /** 부상 복귀 시 컨디션. */
  returnCondition: 0.65,
  /** 승/패 사기 변동. */
  moraleWin: 0.06,
  moraleLoss: 0.06,
  /** 경고 누적 출전정지 임계 (n장마다 1경기). */
  yellowThreshold: 5,
  /** 퇴장 출전정지 경기 수. */
  redSuspension: 2,
  /** 주장이 결장(부상·정지·로테이션)했을 때 팀 전체에 붙는 소폭 사기 페널티. */
  captainMissingPenalty: 0.02,
} as const;

type Outcome = 'W' | 'D' | 'L';

/** 압박·템포가 중립(0.5)보다 높을수록 체력 소모가 커진다 — 강도를 올린 대가.
 *  중립 이하에서는 영향 없음(무리하지 않으면 페널티도 없음), 둘 다 최대치면 최대 1.35배. */
function tacticFatigueMul(tactic: Tactic): number {
  const intensity = (tactic.pressing + tactic.tempo) / 2;
  return 1 + Math.max(0, intensity - 0.5) * 0.7;
}

function applySide(club: Club, tactic: Tactic, outcome: Outcome, injuries: InjuryEvent[]): void {
  const starters = new Set(tactic.lineup.map((s) => s.playerId));
  const slotByPlayer = new Map(tactic.lineup.map((s) => [s.playerId, s.position]));
  const dMorale = outcome === 'W' ? TUNING.moraleWin : outcome === 'L' ? -TUNING.moraleLoss : 0;
  // 주장이 지정돼 있는데 이번 경기 라인업에 없으면(결장) 팀 전체에 소폭 사기 페널티.
  const captainMissing = tactic.captainId !== undefined && !starters.has(tactic.captainId);
  const captainPenalty = captainMissing ? TUNING.captainMissingPenalty : 0;
  // 의료 레벨이 높을수록 회복 보너스 (0.9~1.15배, 의료 20에서만 상한 도달)
  const recoveryBonus = clamp(0.9 + (club.staff.medical / 20) * 0.25, 0.9, 1.15);
  const injuryByPlayer = new Map(injuries.map((e) => [e.playerId, e]));
  const fatigueMul = tacticFatigueMul(tactic);

  for (const p of club.players) {
    if (p.injuryMatches > 0) {
      // 부상 회복 카운트다운 (출전/피로 없음)
      p.injuryMatches--;
      if (p.injuryMatches === 0) {
        p.condition = Math.max(p.condition, TUNING.returnCondition);
        p.injuryName = undefined; // 복귀
      }
    } else if (starters.has(p.id)) {
      p.seasonApps++; // 선발 출전 기록(사기·재계약 판단)
      // 부 포지션으로 뛰면 실전 경험으로 해당 포지션 숙련도가 서서히 오른다(전담 훈련보다는 느림).
      const slot = slotByPlayer.get(p.id);
      if (slot && slot !== p.position) {
        const current = p.familiarity[slot] ?? 0.2;
        if (current < 1) {
          const decisionsFactor = 0.5 + (p.attributes.decisions / 20) * 1.0;
          const multiRoleMul = hasTrait(p, 'multiRole') ? 1.3 : 1;
          const gain = 0.003 * decisionsFactor * multiRoleMul * (1 - current);
          p.familiarity[slot] = clamp(current + gain, 0, 1);
        }
      }
      // 특성: 철강왕(피로↓).
      const fatMul = hasTrait(p, 'ironMan') ? 0.6 : 1;
      // 선발: 피로 누적 (스태미너 높을수록 덜 지침, 회복 공식과 동일한 분모).
      // 압박·템포를 중립 이상으로 올리면(고강도 전술) 그만큼 더 지친다.
      const fatigue = TUNING.fatigueBase * (1 - p.attributes.stamina / 20) * fatMul * fatigueMul;
      p.condition = Math.max(TUNING.minCondition, p.condition - fatigue);
      // 부상 반영 (판정은 simulateMatch.generateInjuries가 이미 확정)
      const inj = injuryByPlayer.get(p.id);
      if (inj) {
        p.injuryMatches = inj.matches;
        p.injuryName = inj.name;
        p.condition = inj.severity === 'serious' ? 0.25 : 0.3;
      }
    } else {
      // 벤치/정지/로테이션: 회복 + 출전정지 카운트다운(미출전으로 1경기 소화)
      const recovery = TUNING.recoveryBase * (0.5 + p.attributes.naturalFitness / 20) * recoveryBonus;
      p.condition = Math.min(1, p.condition + recovery);
      if (p.suspensionMatches > 0) p.suspensionMatches--;
    }
    p.morale = clamp(p.morale + dMorale - captainPenalty, 0, 1);
  }
}

/** 이번 경기 득점 → 선수 시즌 득점 누적(통산 집계의 소스). */
function accumulateGoals(club: Club, stats: MatchResult['playerStats']['home']): void {
  const byId = new Map(club.players.map((p) => [p.id, p]));
  for (const st of stats) {
    const p = byId.get(st.playerId);
    if (p && st.goals > 0) p.seasonGoals = (p.seasonGoals ?? 0) + st.goals;
  }
}

/** 이번 경기 카드 → 징계 반영 (경고 누적/퇴장). 새 정지는 다음 경기부터. */
function processDiscipline(home: Club, away: Club, cards: MatchResult['cards']): void {
  const byId = new Map([...home.players, ...away.players].map((p) => [p.id, p]));
  for (const card of cards) {
    const p = byId.get(card.playerId);
    if (!p) continue;
    if (card.type === 'red') {
      p.suspensionMatches += TUNING.redSuspension;
    } else {
      p.yellowCards++;
      if (p.yellowCards % TUNING.yellowThreshold === 0) p.suspensionMatches += 1;
    }
  }
}

/**
 * 경기 결과를 양 구단 선수 상태에 반영.
 * @param _rng 과거 부상 판정용 시드(현재는 result.injuries로 대체돼 미사용).
 *   호출부 시그니처 안정성을 위해 유지.
 */
export function applyMatchEffects(
  home: Club, homeTactic: Tactic,
  away: Club, awayTactic: Tactic,
  result: MatchResult, _rng: Rng,
): void {
  const [hg, ag] = result.score;
  const homeOutcome: Outcome = hg > ag ? 'W' : hg < ag ? 'L' : 'D';
  const awayOutcome: Outcome = ag > hg ? 'W' : ag < hg ? 'L' : 'D';
  const homeInjuries = result.injuries.filter((e) => e.side === 'home');
  const awayInjuries = result.injuries.filter((e) => e.side === 'away');
  applySide(home, homeTactic, homeOutcome, homeInjuries);
  applySide(away, awayTactic, awayOutcome, awayInjuries);
  accumulateGoals(home, result.playerStats.home);
  accumulateGoals(away, result.playerStats.away);
  processDiscipline(home, away, result.cards);
}
