/**
 * 감독 커리어 — P2 B1: 감독 평판 지수(docs/next-improvements.md B1).
 *
 * 이사회 신뢰도(boardConfidence, 구단 내부의 나에 대한 신임)와 별개로, 평판(reputation)은
 * 축구계 전체에서 감독으로서 쌓은 명성이다. 성적·우승·구단 규모로 시즌마다 누적되며,
 * 이후 타 구단 잡오퍼·경질 후 재취업·협상력의 기준이 된다(B2/B3).
 *
 * 순수 함수(RNG·시간 미사용)라 결정성·재현성을 유지한다. 평판 스칼라는 app GameState가
 * 보관하고, 여기서는 변화량 계산과 등급 산출만 담당한다(board.ts의 confidence와 동일 패턴).
 */

/** 감독 평판 시작값(0~100). 무명에 가까운 지점에서 출발한다. */
export const START_REPUTATION = 35;

/** 감독 평판 등급 — 잡오퍼·협상력의 기준. */
export type ManagerReputationTier = 'unknown' | 'promising' | 'respected' | 'elite' | 'legendary';

export const REPUTATION_TIER_LABEL: Record<ManagerReputationTier, string> = {
  unknown: '무명',
  promising: '유망 감독',
  respected: '검증된 감독',
  elite: '명장',
  legendary: '전설적 명장',
};

export function reputationTier(reputation: number): ManagerReputationTier {
  if (reputation >= 85) return 'legendary';
  if (reputation >= 65) return 'elite';
  if (reputation >= 45) return 'respected';
  if (reputation >= 25) return 'promising';
  return 'unknown';
}

/** 시즌 결과 → 평판 변화 입력. */
export interface ReputationInput {
  /** 리그 최종 순위(1-index). */
  position: number;
  /** 이사회 목표 순위(1-index). 이보다 좋으면(작으면) 기대 초과. */
  objective: number;
  /** 리그 참가 구단 수(순위 정규화용). */
  leagueSize: number;
  /** 부(1=1부, 2=2부). 1부 성취가 더 크게 평가된다. */
  division: number;
  /** 리그 우승 여부. */
  leagueTitle: boolean;
  /** 컵 우승 여부. */
  cupTitle: boolean;
  /** 승격 여부. */
  promoted: boolean;
  /** 강등 여부. */
  relegated: boolean;
  /** 구단 규모(finance.reputation, 0~100 근사). 작은 구단으로 낸 성과는 더 인상적이다. */
  clubReputation: number;
  /** 현재 감독 평판(0~100) — 높을수록 추가 상승이 둔화된다(수렴). */
  currentReputation: number;
}

/**
 * 이번 시즌 평판 변화량. 기대 대비 성적·우승·승강·오버퍼폼을 합산하고, 이미 평판이
 * 높으면 추가 상승을 둔화시켜 한 시즌으로 최고 등급에 도달하지 않게 한다.
 */
export function reputationDelta(inp: ReputationInput): number {
  let d = 0;
  // 목표 대비 — 초과 달성은 +, 미달은 −.
  d += inp.position <= inp.objective ? 2 : -2;
  // 절대 순위 — 상위권(상위 1/4)은 추가 가점, 하위권(하위 1/4)은 감점.
  const quartile = inp.leagueSize > 0 ? inp.position / inp.leagueSize : 0.5;
  if (quartile <= 0.25) d += 2;
  else if (quartile >= 0.75) d -= 1;
  // 우승 — 1부 리그 우승이 가장 큰 명성.
  if (inp.leagueTitle) d += inp.division === 1 ? 8 : 4;
  if (inp.cupTitle) d += 3;
  // 승강 — 승격은 명성, 강등은 오점.
  if (inp.promoted) d += 4;
  if (inp.relegated) d -= 5;
  // 오버퍼폼 보정 — 규모가 작은 구단(clubReputation 낮음)으로 목표를 초과하면 더 인상적,
  // 큰 구단으로 부진하면 더 크게 실망.
  const underdog = inp.clubReputation < 45;
  if (underdog && inp.position <= inp.objective) d += 2;
  if (!underdog && inp.position > inp.objective) d -= 1;
  // 수렴 — 상승분은 현재 평판이 높을수록 둔화(하락분은 그대로 적용).
  if (d > 0) {
    const damp = 1 - Math.max(0, inp.currentReputation - 50) / 100; // 50↑에서 점차 둔화(최대 0.5배)
    d *= Math.max(0.5, damp);
  }
  return Math.round(d * 10) / 10;
}

/** 평판에 변화량을 적용(0~100 클램프). */
export function applyReputation(current: number, delta: number): number {
  return Math.max(0, Math.min(100, current + delta));
}
