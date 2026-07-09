/**
 * 추가시간(스토파지 타임, 고도화 항목58) — 경기 중 실제로 발생한 카드·부상·득점
 * 세리머니 등 지연 요인을 바탕으로 전후반 추가시간을 산정하는 순수 파생 함수.
 * 이미 확정된 카드·부상·이벤트 목록만 읽으므로 RNG를 전혀 소비하지 않고, 표시 전용
 * 메타데이터로만 쓰인다 — 실제 시뮬레이션 틱 수(전후반 45/90분)에는 영향이 없다.
 */
import type { CardEvent, InjuryEvent, MatchEvent } from './types.js';

export interface Stoppage {
  /** 전반 추가시간(분). */
  first: number;
  /** 후반 추가시간(분). */
  second: number;
}

/** liveMatch.ts의 HALF_TIME(45)과 동일한 값 — 순환 import를 피하려고 리터럴로 둔다. */
const HALF_TIME_MINUTE = 45;

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** 전후반 추가시간 산정(고도화 항목58) — 카드·부상은 지연 요인, 후반 득점은
 *  세리머니로 인한 지연을 반영. 전반 기본 1분, 후반 기본 2분(교체 등 기본 소요)에서
 *  시작해 실제 발생 건수만큼 더한다. */
export function computeStoppage(cards: CardEvent[], injuries: InjuryEvent[], events: MatchEvent[]): Stoppage {
  const inFirst = <T extends { minute: number }>(list: T[]): number =>
    list.filter((e) => e.minute <= HALF_TIME_MINUTE).length;
  const inSecond = <T extends { minute: number }>(list: T[]): number =>
    list.filter((e) => e.minute > HALF_TIME_MINUTE).length;
  const goalsInSecond = events.filter(
    (e) => e.minute > HALF_TIME_MINUTE && (e.outcome === 'GOAL' || e.outcome === 'OWN_GOAL'),
  ).length;

  const first = clampInt(1 + 0.4 * inFirst(cards) + 0.6 * inFirst(injuries), 0, 5);
  const second = clampInt(2 + 0.4 * inSecond(cards) + 0.6 * inSecond(injuries) + 0.3 * goalsInSecond, 1, 8);
  return { first, second };
}
