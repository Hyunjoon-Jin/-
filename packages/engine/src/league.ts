/**
 * 헤드리스 시즌 시뮬 (한 번에 전 경기).
 * season.ts(상태 기반)를 감싸 일정·집계 로직을 단일 소스로 공유한다.
 */
import type { Club, MatchResult, Tactic } from './types.js';
import {
  createSeasonState, playToEnd, computeTable, type TableRow,
} from './season.js';

export type { TableRow };

export interface SeasonResult {
  table: TableRow[];
  matches: MatchResult[];
}

/**
 * 한 시즌을 한 번에 시뮬레이션.
 * @param baseSeed 경기별 시드는 baseSeed + 경기 인덱스로 파생(재현성 유지).
 */
export function simulateSeason(
  clubs: Club[],
  baseSeed: number,
  tactics?: Map<string, Tactic>,
): SeasonResult {
  const state = createSeasonState(clubs, baseSeed);
  playToEnd(state, tactics);
  return { table: computeTable(state), matches: state.results };
}
