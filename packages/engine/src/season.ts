/**
 * 상태를 가진 시즌 진행 (경기 단위).
 * 일정을 들고, 라운드/경기 단위로 시뮬하며, 지금까지의 결과로 순위표를 만든다.
 * 전술은 clubId→Tactic 맵으로 주입(없으면 기본 전술). 경기마다 사용자가 바꿀 수 있다.
 */
import type { Club, MatchResult, Tactic } from './types.js';
import { doubleRoundRobin, type Fixture } from './schedule.js';
import { simulateMatch } from './simulateMatch.js';
import { defaultTactic } from './generate.js';
import { applyMatchEffects } from './matchEffects.js';
import { Rng } from './rng.js';

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

export interface SeasonState {
  clubs: Club[];
  fixtures: Fixture[];
  /** 진행 순서대로 쌓인 결과. fixtures[0..cursor-1] 과 1:1 대응. */
  results: MatchResult[];
  /** 다음에 진행할 fixture 인덱스. */
  cursor: number;
  baseSeed: number;
}

export function createSeasonState(clubs: Club[], baseSeed: number): SeasonState {
  return {
    clubs,
    fixtures: doubleRoundRobin(clubs.map((c) => c.id)),
    results: [],
    cursor: 0,
    baseSeed,
  };
}

export function isSeasonOver(s: SeasonState): boolean {
  return s.cursor >= s.fixtures.length;
}

export function totalRounds(s: SeasonState): number {
  return s.fixtures.reduce((m, f) => Math.max(m, f.round), 0);
}

/** 다음에 진행할 라운드 번호(시즌 종료 시 마지막 라운드). */
export function currentRound(s: SeasonState): number {
  if (isSeasonOver(s)) return totalRounds(s);
  return s.fixtures[s.cursor]!.round;
}

type TacticMap = Map<string, Tactic> | undefined;

function tacticFor(club: Club, tactics: TacticMap): Tactic {
  return tactics?.get(club.id) ?? defaultTactic(club);
}

/** 다음 한 경기 진행. clubs/결과가 변경되고, 선수 상태(피로·부상·사기)가 반영된다. */
export function playNext(s: SeasonState, tactics?: TacticMap): MatchResult {
  const fx = s.fixtures[s.cursor]!;
  const byId = new Map(s.clubs.map((c) => [c.id, c]));
  const home = byId.get(fx.homeId)!;
  const away = byId.get(fx.awayId)!;
  const homeTactic = tacticFor(home, tactics);
  const awayTactic = tacticFor(away, tactics);
  const result = simulateMatch({
    home: { club: home, tactic: homeTactic },
    away: { club: away, tactic: awayTactic },
    seed: s.baseSeed + s.cursor,
  });
  // 경기 후 상태 변화 (경기 시뮬과 별도 난수 스트림)
  applyMatchEffects(home, homeTactic, away, awayTactic, result,
    new Rng(s.baseSeed * 2 + s.cursor + 7919));
  s.results.push(result);
  s.cursor++;
  return result;
}

/**
 * 미리 계산된 결과를 다음 fixture로 커밋(라이브 관전 결과 주입용).
 * 호출자는 fixtures[cursor]와 일치하는 결과를 fixture 순서대로 넣어야 한다.
 */
export function commitResult(s: SeasonState, result: MatchResult): void {
  if (isSeasonOver(s)) return;
  s.results.push(result);
  s.cursor++;
}

/** 현재 라운드의 모든 경기를 진행. */
export function playRound(s: SeasonState, tactics?: TacticMap): MatchResult[] {
  if (isSeasonOver(s)) return [];
  const round = currentRound(s);
  const out: MatchResult[] = [];
  while (!isSeasonOver(s) && currentRound(s) === round) {
    out.push(playNext(s, tactics));
  }
  return out;
}

/** 남은 모든 경기를 진행. */
export function playToEnd(s: SeasonState, tactics?: TacticMap): void {
  while (!isSeasonOver(s)) playNext(s, tactics);
}

function emptyRow(club: Club): TableRow {
  return {
    clubId: club.id, name: club.name,
    played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0,
  };
}

/** 지금까지의 결과로 순위표 산출. */
export function computeTable(s: SeasonState): TableRow[] {
  const rows = new Map(s.clubs.map((c) => [c.id, emptyRow(c)]));
  for (const r of s.results) {
    const hr = rows.get(r.homeClubId);
    const ar = rows.get(r.awayClubId);
    if (!hr || !ar) continue;
    const [hg, ag] = r.score;
    hr.played++; ar.played++;
    hr.gf += hg; hr.ga += ag;
    ar.gf += ag; ar.ga += hg;
    if (hg > ag) { hr.won++; hr.points += 3; ar.lost++; }
    else if (hg < ag) { ar.won++; ar.points += 3; hr.lost++; }
    else { hr.drawn++; ar.drawn++; hr.points++; ar.points++; }
  }
  return [...rows.values()].sort(
    (a, b) => b.points - a.points || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf,
  );
}
