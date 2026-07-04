/**
 * 승강제 (다중 리그).
 * 1부 하위 N팀 강등 ↔ 2부 상위 N팀 승격. 구단의 division 필드를 변경한다.
 */
import type { Club } from './types.js';

export interface PromRelResult {
  promoted: string[];  // 2부 → 1부
  relegated: string[]; // 1부 → 2부
}

export function clubsInDivision(clubs: Club[], division: number): Club[] {
  return clubs.filter((c) => c.division === division);
}

/**
 * 순위표(부별)를 받아 승강을 적용.
 * @param d1Table 1부 최종 순위(0-index).
 * @param d2Table 2부 최종 순위.
 * @param promoteCount 자동 승격 팀 수(2부 상위).
 * @param relegateCount 강등 팀 수(1부 하위). 생략 시 promoteCount와 동일(하위 호환).
 */
export function applyPromotionRelegation(
  clubs: Club[],
  d1Table: { clubId: string }[],
  d2Table: { clubId: string }[],
  promoteCount = 3,
  relegateCount = promoteCount,
): PromRelResult {
  const relegated = d1Table.slice(-relegateCount).map((r) => r.clubId);
  const promoted = d2Table.slice(0, promoteCount).map((r) => r.clubId);
  const byId = new Map(clubs.map((c) => [c.id, c]));
  for (const id of relegated) { const c = byId.get(id); if (c) c.division = 1; }
  for (const id of promoted) { const c = byId.get(id); if (c) c.division = 0; }
  return { promoted, relegated };
}
