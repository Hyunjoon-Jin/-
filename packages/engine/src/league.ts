/**
 * 리그 시즌 시뮬레이션 (MVP 단일 리그).
 * 더블 라운드로빈 일정 생성 + 전 경기 시뮬 + 순위표 집계.
 */
import type { Club, MatchResult, Tactic } from './types.js';
import { simulateMatch } from './simulateMatch.js';
import { defaultTactic } from './generate.js';

export interface TableRow {
  clubId: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
}

export interface SeasonResult {
  table: TableRow[];
  matches: MatchResult[];
}

/** 더블 라운드로빈 일정: (i,j) 홈/원정 양방향. */
function fixtures(n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) out.push([i, j]);
    }
  }
  return out;
}

function emptyRow(club: Club): TableRow {
  return {
    clubId: club.id, name: club.name,
    played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0,
  };
}

/**
 * 한 시즌 시뮬레이션.
 * @param baseSeed 경기별 시드는 baseSeed + 경기 인덱스로 파생(재현성 유지).
 */
export function simulateSeason(
  clubs: Club[],
  baseSeed: number,
  tactics?: Map<string, Tactic>,
): SeasonResult {
  const tacticOf = (c: Club): Tactic => tactics?.get(c.id) ?? defaultTactic(c);
  const rows = new Map(clubs.map((c) => [c.id, emptyRow(c)]));
  const matches: MatchResult[] = [];

  fixtures(clubs.length).forEach(([hi, ai], idx) => {
    const home = clubs[hi]!;
    const away = clubs[ai]!;
    const r = simulateMatch({
      home: { club: home, tactic: tacticOf(home) },
      away: { club: away, tactic: tacticOf(away) },
      seed: baseSeed + idx,
    });
    matches.push(r);

    const hr = rows.get(home.id)!;
    const ar = rows.get(away.id)!;
    const [hg, ag] = r.score;
    hr.played++; ar.played++;
    hr.gf += hg; hr.ga += ag;
    ar.gf += ag; ar.ga += hg;
    if (hg > ag) { hr.won++; hr.points += 3; ar.lost++; }
    else if (hg < ag) { ar.won++; ar.points += 3; hr.lost++; }
    else { hr.drawn++; ar.drawn++; hr.points++; ar.points++; }
  });

  const table = [...rows.values()].sort(
    (a, b) => b.points - a.points || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf,
  );
  return { table, matches };
}
