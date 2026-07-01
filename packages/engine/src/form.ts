/**
 * 최근 폼(form) 집계 — 경기 프리뷰·스카우팅용.
 * 결과 목록(진행 순서)에서 특정 구단의 최근 n경기 승·무·패를 추린다.
 * 순수 함수(시드 무관) — MatchResult의 스코어만 사용.
 */
import type { MatchResult } from './types.js';

export type FormResult = 'W' | 'D' | 'L';

export interface FormSummary {
  /** 최근 n경기 결과(오래된 → 최신 순). */
  results: FormResult[];
  /** 해당 구간 승점(승3·무1·패0). */
  points: number;
  /** 득점 합. */
  gf: number;
  /** 실점 합. */
  ga: number;
}

/**
 * 특정 구단의 최근 n경기 폼.
 * @param results 시즌 진행 순서의 경기 결과(과거→현재).
 */
export function recentForm(results: MatchResult[], clubId: string, n = 5): FormSummary {
  const played = results.filter((m) => m.homeClubId === clubId || m.awayClubId === clubId);
  const window = played.slice(-n);
  const out: FormSummary = { results: [], points: 0, gf: 0, ga: 0 };
  for (const m of window) {
    const home = m.homeClubId === clubId;
    const gf = home ? m.score[0] : m.score[1];
    const ga = home ? m.score[1] : m.score[0];
    out.gf += gf;
    out.ga += ga;
    const r: FormResult = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
    out.results.push(r);
    out.points += r === 'W' ? 3 : r === 'D' ? 1 : 0;
  }
  return out;
}
