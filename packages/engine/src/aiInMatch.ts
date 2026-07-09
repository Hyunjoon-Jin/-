/**
 * AI 구단의 하프타임 개입 (F01 부상 교체 · F09 스코어라인 기반 반응형 전술).
 * 사람 관전자만 쓰던 자유 교체·빠른 지시를, AI 구단에도 동일한 하프타임 개입
 * 지점에서 자동으로 적용해 사람-AI 비대칭을 없앤다.
 */
import type { Club, InjuryEvent, MatchResult, Tactic } from './types.js';
import { LiveMatch, HALF_TIME } from './liveMatch.js';
import { MATCH_LENGTH } from './simulateMatch.js';
import type { MatchSetup } from './simulateMatch.js';
import { isAvailable, currentAbility, familiarityAt } from './derived.js';

type QuickTacticValues = Pick<Tactic, 'mentality' | 'tempo' | 'pressing' | 'width' | 'defensiveLine'>;

/** 뒤지고 있을 때 적용하는 공격적 지시(사람의 "추격 모드"와 동일한 값). */
const CHASE_TACTIC: QuickTacticValues = { mentality: 0.75, tempo: 0.8, pressing: 0.75, width: 0.6, defensiveLine: 0.65 };
/** 앞서고 있을 때 적용하는 안정적 지시(사람의 "리드 지키기"와 동일한 값). */
const PROTECT_TACTIC: QuickTacticValues = { mentality: 0.3, tempo: 0.35, pressing: 0.35, width: 0.4, defensiveLine: 0.35 };
/** 이 골차 이상 앞서야 리드 지키기로 전환(1점 차는 아직 불안하므로 유지). */
const PROTECT_LEAD_MARGIN = 2;

/** 스코어라인에 따른 반응형 전술. 지고 있으면 추격, 2골 이상 앞서면 안정화(F09,
 *  고도화 항목44부터는 하프타임뿐 아니라 득실차가 바뀔 때마다 재호출된다). */
export function reactiveTactic(tactic: Tactic, myGoals: number, oppGoals: number): Tactic | null {
  const diff = myGoals - oppGoals;
  if (diff < 0) return { ...tactic, ...CHASE_TACTIC };
  if (diff >= PROTECT_LEAD_MARGIN) return { ...tactic, ...PROTECT_TACTIC };
  return null;
}

/** 슬롯에 넣을 벤치 교체 자원 선정 — 해당 포지션 숙련도 우선, 그다음 현재 능력(CA). */
function pickReplacement(bench: Club['players'], position: Tactic['lineup'][number]['position']) {
  return bench.reduce((best, cand) => {
    const famBest = familiarityAt(best, position);
    const famCand = familiarityAt(cand, position);
    if (famCand !== famBest) return famCand > famBest ? cand : best;
    return currentAbility(cand) > currentAbility(best) ? cand : best;
  });
}

/** 로테이션 대상으로 삼는 컨디션 임계값(고도화 항목49) — 경기 전 컨디션이 이 미만인
 *  선발(GK 제외)이 있으면 벤치 최적 자원으로 교체를 고려한다. */
const ROTATION_CONDITION_THRESHOLD = 0.6;
/** 경기 중 이 분(minute)에 한 번 컨디션 기반 로테이션을 점검한다(경기 중반 이후 한 시점). */
export const ROTATION_CHECK_MINUTE = 65;

/**
 * 경기 전 컨디션이 낮았던 선발(GK 제외) 중 가장 지친 선수 1명을 벤치 최적 자원으로
 * 교체한다(고도화 항목49) — 결정론적(RNG 미소비), 부상 교체와 동일한 pickReplacement를
 * 재사용한다. 컨디션은 경기 중 변하지 않는 킥오프 시점 값이라 이 판단도 경기 내내
 * 동일하게 유지된다. 대상이 없으면 null.
 */
export function decideConditionRotation(club: Club, tactic: Tactic): Tactic | null {
  const byId = new Map(club.players.map((p) => [p.id, p]));
  let worstSlot: Tactic['lineup'][number] | null = null;
  let worstCondition = ROTATION_CONDITION_THRESHOLD;
  for (const slot of tactic.lineup) {
    if (slot.position === 'GK') continue;
    const p = byId.get(slot.playerId);
    if (!p || !isAvailable(p)) continue;
    if (p.condition < worstCondition) {
      worstCondition = p.condition;
      worstSlot = slot;
    }
  }
  if (!worstSlot) return null;

  const lineupIds = new Set(tactic.lineup.map((s) => s.playerId));
  const bench = club.players.filter((p) => isAvailable(p) && !lineupIds.has(p.id));
  if (bench.length === 0) return null;
  const best = pickReplacement(bench, worstSlot.position);
  const nextLineup = tactic.lineup.map((s) => (s.playerId === worstSlot!.playerId ? { ...s, playerId: best.id } : s));
  return { ...tactic, lineup: nextLineup };
}

/** 전반 중 부상당한 선발을 하프타임에 같은 슬롯의 최적 벤치 자원으로 교체(F01). */
export function injurySubstitution(club: Club, tactic: Tactic, halfInjuries: InjuryEvent[]): Tactic | null {
  if (halfInjuries.length === 0) return null;
  const injuredIds = new Set(halfInjuries.map((e) => e.playerId));
  const outSlots = tactic.lineup.filter((s) => injuredIds.has(s.playerId));
  if (outSlots.length === 0) return null;

  const lineupIds = new Set(tactic.lineup.map((s) => s.playerId));
  let nextLineup = tactic.lineup;
  let changed = false;
  for (const slot of outSlots) {
    const bench = club.players.filter((p) => isAvailable(p) && !lineupIds.has(p.id));
    if (bench.length === 0) continue;
    const best = pickReplacement(bench, slot.position);
    nextLineup = nextLineup.map((s) => (s.playerId === slot.playerId ? { ...s, playerId: best.id } : s));
    lineupIds.delete(slot.playerId);
    lineupIds.add(best.id);
    changed = true;
  }
  return changed ? { ...tactic, lineup: nextLineup } : null;
}

/**
 * 한 팀의 하프타임 개입을 결정 — 부상 교체(F01)를 먼저 적용하고, 그 위에 스코어라인
 * 기반 반응형 전술(F09)을 얹는다. 아무 변화도 없으면 null(개입 없음).
 * @param halfInjuries 전반 중 이 팀에서 발생한 부상 이벤트만 필터링해 넘긴다.
 */
export function decideAiHalftimeTactic(
  club: Club, tactic: Tactic, myGoals: number, oppGoals: number, halfInjuries: InjuryEvent[],
): Tactic | null {
  let next = tactic;
  let changed = false;

  const subbed = injurySubstitution(club, next, halfInjuries);
  if (subbed) { next = subbed; changed = true; }

  const reactive = reactiveTactic(next, myGoals, oppGoals);
  if (reactive) { next = reactive; changed = true; }

  return changed ? next : null;
}

/**
 * simulateMatch와 동일한 로직을 공유하되, 하프타임에 양 팀 모두 부상 교체(F01)를
 * 자동 적용하고, 득실차가 바뀌는 시점마다(하프타임 한정이 아니라 경기 중 실시간으로)
 * 반응형 전술(F09, 고도화 항목44)을 재평가한다. RNG를 전혀 소비하지 않는 결정론적
 * 판단이라 재현성에는 영향이 없다 — 개입이 전혀 없으면 simulateMatch와 완전히
 * 동일한 결과를 낸다(LiveMatch가 같은 컨텍스트를 재사용하기 때문).
 */
export function simulateMatchWithAiTactics(setup: MatchSetup): MatchResult {
  const live = new LiveMatch(setup);
  const original = { home: setup.home.tactic, away: setup.away.tactic };
  // 반응형 전술 판단의 기준(중립) 라인업 — 득실차 판단용 mentality/tempo 등은 항상
  // 원래(original) 값을 쓰고, 부상 교체로 바뀐 라인업만 여기에 누적 반영한다.
  const baseLineup = { home: setup.home.tactic.lineup, away: setup.away.tactic.lineup };
  const lastDiff = { home: 0, away: 0 };

  const applyReactive = (side: 'home' | 'away'): void => {
    const [hg, ag] = live.score();
    const myGoals = side === 'home' ? hg : ag;
    const oppGoals = side === 'home' ? ag : hg;
    const baseTactic: Tactic = { ...original[side], lineup: baseLineup[side] };
    const next = reactiveTactic(baseTactic, myGoals, oppGoals) ?? baseTactic;
    live.setTactic(side, next);
  };

  for (let m = 1; m <= MATCH_LENGTH; m++) {
    live.runUntil(m);

    if (m === HALF_TIME) {
      const halfInjuries = live.injuries().filter((e) => e.minute <= HALF_TIME);
      for (const side of ['home', 'away'] as const) {
        const sideInjuries = halfInjuries.filter((e) => e.side === side);
        const baseTactic: Tactic = { ...original[side], lineup: baseLineup[side] };
        const subbed = injurySubstitution(setup[side].club, baseTactic, sideInjuries);
        if (subbed) {
          baseLineup[side] = subbed.lineup;
          applyReactive(side);
        }
      }
    }

    if (m === ROTATION_CHECK_MINUTE) {
      for (const side of ['home', 'away'] as const) {
        const baseTactic: Tactic = { ...original[side], lineup: baseLineup[side] };
        const rotated = decideConditionRotation(setup[side].club, baseTactic);
        if (rotated) {
          baseLineup[side] = rotated.lineup;
          applyReactive(side);
        }
      }
    }

    const [hg, ag] = live.score();
    for (const side of ['home', 'away'] as const) {
      const myGoals = side === 'home' ? hg : ag;
      const oppGoals = side === 'home' ? ag : hg;
      const diff = myGoals - oppGoals;
      if (diff === lastDiff[side]) continue;
      lastDiff[side] = diff;
      applyReactive(side);
    }
  }

  return live.result();
}
