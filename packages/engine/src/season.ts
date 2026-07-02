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

/** 리그가 성립하려면 최소 2개 구단이 있어야 한다(1개면 경기 없이 조용히 "완료" 처리됨). */
const MIN_LEAGUE_CLUBS = 2;

export function createSeasonState(clubs: Club[], baseSeed: number): SeasonState {
  if (clubs.length < MIN_LEAGUE_CLUBS) {
    throw new Error(`createSeasonState: 리그에는 최소 ${MIN_LEAGUE_CLUBS}개 구단이 필요합니다(받은 수: ${clubs.length}).`);
  }
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

// s.clubs는 시즌 내내 배열 자체(참조)는 바뀌지 않으므로, 매 경기 새로 Map을 만들지
// 않고 배열 참조 기준으로 캐시해 재사용한다(WeakMap이라 GC를 막지 않음).
const clubMapCache = new WeakMap<Club[], Map<string, Club>>();
function clubsById(clubs: Club[]): Map<string, Club> {
  let m = clubMapCache.get(clubs);
  if (!m) {
    m = new Map(clubs.map((c) => [c.id, c]));
    clubMapCache.set(clubs, m);
  }
  return m;
}

type TacticMap = Map<string, Tactic> | undefined;

function tacticFor(club: Club, tactics: TacticMap): Tactic {
  return tactics?.get(club.id) ?? defaultTactic(club);
}

/** 다음 한 경기 진행. clubs/결과가 변경되고, 선수 상태(피로·부상·사기)가 반영된다. */
export function playNext(s: SeasonState, tactics?: TacticMap): MatchResult {
  const fx = s.fixtures[s.cursor]!;
  const byId = clubsById(s.clubs);
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

/** 두 구단 간 상대전적(승점차·득실차) — 승점·득실차·득점까지 같을 때의 동률 기준. */
function headToHead(results: MatchResult[], aId: string, bId: string): { points: number; gd: number } {
  let aPts = 0; let bPts = 0; let aGd = 0; let bGd = 0;
  for (const r of results) {
    const isAvB = r.homeClubId === aId && r.awayClubId === bId;
    const isBvA = r.homeClubId === bId && r.awayClubId === aId;
    if (!isAvB && !isBvA) continue;
    const [hg, ag] = r.score;
    const [aGoals, bGoals] = isAvB ? [hg, ag] : [ag, hg];
    aGd += aGoals - bGoals; bGd += bGoals - aGoals;
    if (aGoals > bGoals) aPts += 3;
    else if (aGoals < bGoals) bPts += 3;
    else { aPts += 1; bPts += 1; }
  }
  return { points: aPts - bPts, gd: aGd - bGd };
}

/** 지금까지의 결과로 순위표 산출.
 *  승점·득실차·득점이 모두 같으면 배열 삽입 순서(구단 생성 순서)로 조용히 정해지던 것을
 *  방지하기 위해, 상대전적(승점→득실차)을 먼저 확인하고 그래도 갈리지 않으면 구단 id로
 *  결정론적으로 확정한다. */
export function computeTable(s: SeasonState): TableRow[] {
  const rows = new Map(s.clubs.map((c) => [c.id, emptyRow(c)]));
  for (const r of s.results) {
    const hr = rows.get(r.homeClubId);
    const ar = rows.get(r.awayClubId);
    if (!hr || !ar) {
      // 순위표에 없는 구단을 참조하는 결과 — 잘못된/오래된 MatchResult가 주입됐다는
      // 뜻이므로 조용히 버리지 않고 호출자 오류로 즉시 드러낸다.
      throw new Error(`computeTable: 알 수 없는 클럽을 참조하는 결과(${r.homeClubId} vs ${r.awayClubId})`);
    }
    const [hg, ag] = r.score;
    hr.played++; ar.played++;
    hr.gf += hg; hr.ga += ag;
    ar.gf += ag; ar.ga += hg;
    if (hg > ag) { hr.won++; hr.points += 3; ar.lost++; }
    else if (hg < ag) { ar.won++; ar.points += 3; hr.lost++; }
    else { hr.drawn++; ar.drawn++; hr.points++; ar.points++; }
  }
  return [...rows.values()].sort((a, b) => {
    const byPoints = b.points - a.points;
    if (byPoints !== 0) return byPoints;
    const byGd = (b.gf - b.ga) - (a.gf - a.ga);
    if (byGd !== 0) return byGd;
    const byGf = b.gf - a.gf;
    if (byGf !== 0) return byGf;
    const h2h = headToHead(s.results, a.clubId, b.clubId);
    if (h2h.points !== 0) return -h2h.points;
    if (h2h.gd !== 0) return -h2h.gd;
    return a.clubId.localeCompare(b.clubId);
  });
}
