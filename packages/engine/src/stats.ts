/**
 * 시즌 선수 통계 집계 + 어워드 (표현 심화).
 * 경기 결과(MatchResult.playerStats)를 모아 출전·득점·평균 평점을 산출하고,
 * 득점왕·시즌 베스트 플레이어를 뽑는다.
 */
import type { Club, MatchResult, Position, Tactic } from './types.js';
import { lineOf } from './teamStrength.js';
import type { Fixture } from './schedule.js';
import type { Weather } from './weather.js';

export interface PlayerSeasonStat {
  playerId: string;
  name: string;
  clubId: string;
  clubName: string;
  /** 이 시즌 마지막으로 출전한 포지션(베스트 XI 분류에 사용). */
  position: Position;
  apps: number;
  goals: number;
  assists: number;
  shots: number;
  avgRating: number;
  /** GK로 출전해 무실점으로 마친 경기 수(골든글러브 집계용). GK가 아니면 0. */
  cleanSheets: number;
  /** 시즌 빅찬스 생성 수(고도화 항목45). */
  bigChancesCreated: number;
  /** 시즌 빅찬스 중 득점으로 이어지지 않은 수(고도화 항목45). */
  bigChancesMissed: number;
}

export interface BestXIEntry {
  position: Position;
  playerId: string;
  name: string;
  clubName: string;
  avgRating: number;
  goals: number;
  assists: number;
}

export interface SeasonAwards {
  topScorer?: { playerId: string; name: string; clubName: string; goals: number };
  /** 시즌 최다 어시스트. */
  topAssist?: { playerId: string; name: string; clubName: string; assists: number };
  playerOfSeason?: { playerId: string; name: string; clubName: string; avgRating: number };
  /** 시즌 최다 클린시트 GK. */
  goldenGlove?: { playerId: string; name: string; clubName: string; cleanSheets: number };
  /** 시즌 베스트 XI(GK 1 · DEF 4 · MID 3 · ATT 3, 최소 출전 이상 중 라인별 평균 평점 최고). */
  bestXI?: BestXIEntry[];
  /** 시즌 최다 맨오브더매치(고도화 항목38). */
  mostMotm?: { playerId: string; name: string; clubName: string; count: number };
}

export interface MotmTallyEntry {
  playerId: string;
  name: string;
  clubName: string;
  count: number;
}

/**
 * 시즌 맨오브더매치 집계(고도화 항목38) — 경기마다 이미 계산되는
 * MatchResult.motmPlayerId를 선수별로 세어 내림차순 정렬한다(동률이면 이름순으로
 * 결정론적으로 정렬).
 */
export function motmTally(results: MatchResult[]): MotmTallyEntry[] {
  const map = new Map<string, MotmTallyEntry>();
  for (const r of results) {
    if (!r.motmPlayerId) continue;
    const stat = [...r.playerStats.home, ...r.playerStats.away].find((s) => s.playerId === r.motmPlayerId);
    if (!stat) continue;
    const clubName = r.playerStats.home.includes(stat) ? r.homeClubName : r.awayClubName;
    let e = map.get(r.motmPlayerId);
    if (!e) { e = { playerId: r.motmPlayerId, name: stat.name, clubName, count: 0 }; map.set(r.motmPlayerId, e); }
    e.count++;
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

interface Acc {
  playerId: string; name: string; clubId: string; clubName: string; position: Position;
  apps: number; goals: number; assists: number; shots: number; totalRating: number; cleanSheets: number;
  bigChancesCreated: number; bigChancesMissed: number;
}

/** 시즌 전 경기 결과에서 선수별 통계 집계. */
export function aggregatePlayerStats(results: MatchResult[]): PlayerSeasonStat[] {
  const map = new Map<string, Acc>();
  const add = (
    st: MatchResult['playerStats']['home'][number], clubId: string, clubName: string,
  ) => {
    let a = map.get(st.playerId);
    if (!a) {
      a = {
        playerId: st.playerId, name: st.name, clubId, clubName, position: st.position,
        apps: 0, goals: 0, assists: 0, shots: 0, totalRating: 0, cleanSheets: 0,
        bigChancesCreated: 0, bigChancesMissed: 0,
      };
      map.set(st.playerId, a);
    }
    // 이적으로 소속이 바뀌면 최신 소속으로, 포지션 전환 훈련 중이면 최신 출전 포지션으로 갱신
    a.clubId = clubId; a.clubName = clubName; a.position = st.position;
    a.apps++;
    a.goals += st.goals;
    a.assists += st.assists;
    a.shots += st.shots;
    a.totalRating += st.rating;
    if (st.cleanSheet) a.cleanSheets++;
    a.bigChancesCreated += st.bigChancesCreated ?? 0;
    a.bigChancesMissed += st.bigChancesMissed ?? 0;
  };
  for (const r of results) {
    for (const st of r.playerStats.home) add(st, r.homeClubId, r.homeClubName);
    for (const st of r.playerStats.away) add(st, r.awayClubId, r.awayClubName);
  }
  return [...map.values()].map((a) => ({
    playerId: a.playerId, name: a.name, clubId: a.clubId, clubName: a.clubName, position: a.position,
    apps: a.apps, goals: a.goals, assists: a.assists, shots: a.shots,
    avgRating: a.apps > 0 ? a.totalRating / a.apps : 0,
    cleanSheets: a.cleanSheets,
    bigChancesCreated: a.bigChancesCreated,
    bigChancesMissed: a.bigChancesMissed,
  }));
}

/** 시즌 최다 클린시트 GK(1개 이상일 때만). */
export function goldenGlove(stats: PlayerSeasonStat[]): PlayerSeasonStat | undefined {
  const withCleanSheets = stats.filter((s) => s.cleanSheets > 0);
  if (withCleanSheets.length === 0) return undefined;
  return [...withCleanSheets].sort((a, b) => b.cleanSheets - a.cleanSheets || b.avgRating - a.avgRating)[0];
}

/** 득점 → 평균 평점 → 출전 순 정렬. */
export function topScorers(stats: PlayerSeasonStat[], n = 10): PlayerSeasonStat[] {
  return [...stats]
    .sort((a, b) => b.goals - a.goals || b.avgRating - a.avgRating || b.apps - a.apps)
    .slice(0, n);
}

/** 어시스트 → 평균 평점 → 출전 순 정렬. */
export function topAssists(stats: PlayerSeasonStat[], n = 10): PlayerSeasonStat[] {
  return [...stats]
    .sort((a, b) => b.assists - a.assists || b.avgRating - a.avgRating || b.apps - a.apps)
    .slice(0, n);
}

/** 최소 출전 이상에서 평균 평점 최고 = 시즌 베스트 플레이어. */
export function playerOfSeason(stats: PlayerSeasonStat[], minApps: number): PlayerSeasonStat | undefined {
  return [...stats]
    .filter((s) => s.apps >= minApps)
    .sort((a, b) => b.avgRating - a.avgRating || b.goals - a.goals)[0];
}

/** 라인별 베스트 XI 정원(4-3-3 기준 — GK 1 · DEF 4 · MID 3 · ATT 3). */
const BEST_XI_SHAPE = { GK: 1, DEF: 4, MID: 3, ATT: 3 } as const;

/**
 * 시즌 베스트 XI. 최소 출전 이상인 선수만 대상으로, 라인(GK/DEF/MID/ATT)별로
 * 평균 평점(동률이면 득점) 상위 정원만큼 선발한다 — 실제 라인업 포메이션과
 * 무관하게 항상 4-3-3 기준 11명으로 고정.
 */
export function bestXI(stats: PlayerSeasonStat[], minApps: number): BestXIEntry[] {
  const eligible = stats.filter((s) => s.apps >= minApps);
  const out: BestXIEntry[] = [];
  for (const line of ['GK', 'DEF', 'MID', 'ATT'] as const) {
    const pool = eligible
      .filter((s) => lineOf(s.position) === line)
      .sort((a, b) => b.avgRating - a.avgRating || b.goals - a.goals);
    for (const s of pool.slice(0, BEST_XI_SHAPE[line])) {
      out.push({
        position: s.position, playerId: s.playerId, name: s.name, clubName: s.clubName,
        avgRating: s.avgRating, goals: s.goals, assists: s.assists,
      });
    }
  }
  return out;
}

/** 시즌 어워드 산출. minApps는 보통 (총 라운드의 절반). */
export function seasonAwards(stats: PlayerSeasonStat[], minApps: number): SeasonAwards {
  const scorer = topScorers(stats, 1)[0];
  const assistLeader = topAssists(stats, 1)[0];
  const potm = playerOfSeason(stats, minApps);
  const glove = goldenGlove(stats);
  const xi = bestXI(stats, minApps);
  return {
    topScorer: scorer && scorer.goals > 0
      ? { playerId: scorer.playerId, name: scorer.name, clubName: scorer.clubName, goals: scorer.goals }
      : undefined,
    topAssist: assistLeader && assistLeader.assists > 0
      ? { playerId: assistLeader.playerId, name: assistLeader.name, clubName: assistLeader.clubName, assists: assistLeader.assists }
      : undefined,
    playerOfSeason: potm
      ? { playerId: potm.playerId, name: potm.name, clubName: potm.clubName, avgRating: potm.avgRating }
      : undefined,
    goldenGlove: glove
      ? { playerId: glove.playerId, name: glove.name, clubName: glove.clubName, cleanSheets: glove.cleanSheets }
      : undefined,
    bestXI: xi.length > 0 ? xi : undefined,
  };
}

export interface ClubDisciplineRow {
  clubId: string;
  clubName: string;
  yellowCards: number;
  redCards: number;
  totalCards: number;
}

/**
 * 시즌 페어플레이(징계) 순위(고도화 항목22) — 구단별 옐로/레드카드 집계.
 * 카드 수가 적을수록(동률이면 레드가 적을수록) 페어플레이 순위가 높다.
 */
export function clubDisciplineTable(results: MatchResult[]): ClubDisciplineRow[] {
  const map = new Map<string, ClubDisciplineRow>();
  const ensure = (clubId: string, clubName: string): ClubDisciplineRow => {
    let row = map.get(clubId);
    if (!row) {
      row = { clubId, clubName, yellowCards: 0, redCards: 0, totalCards: 0 };
      map.set(clubId, row);
    }
    return row;
  };
  for (const r of results) {
    ensure(r.homeClubId, r.homeClubName);
    ensure(r.awayClubId, r.awayClubName);
    for (const c of r.cards) {
      const row = c.side === 'home' ? ensure(r.homeClubId, r.homeClubName) : ensure(r.awayClubId, r.awayClubName);
      if (c.type === 'yellow') row.yellowCards++;
      else row.redCards++;
      row.totalCards++;
    }
  }
  return [...map.values()].sort((a, b) => a.totalCards - b.totalCards || a.redCards - b.redCards);
}

export interface MonthlyManagerAward {
  /** 블록 순번(1부터) — 실제 달력이 없어 라운드를 blockSize개씩 묶은 것. */
  blockIndex: number;
  fromRound: number;
  toRound: number;
  clubId: string;
  clubName: string;
  points: number;
  gd: number;
  gf: number;
}

/**
 * 이달의 감독(고도화 항목24) — 실제 달력 대신 라운드를 blockSize개씩 묶어(기본 4라운드)
 * 그 구간 승점(동률이면 득실차·득점) 최고 구단을 뽑는다. fixtures[i]와 results[i]가
 * 1:1 대응한다는 SeasonState 규약을 그대로 활용(round 조회용).
 */
export function monthlyManagerAwards(
  fixtures: Fixture[], results: MatchResult[], blockSize = 4,
): MonthlyManagerAward[] {
  const totalRounds = fixtures.reduce((m, f) => Math.max(m, f.round), 0);
  const awards: MonthlyManagerAward[] = [];
  for (let from = 1; from <= totalRounds; from += blockSize) {
    const to = Math.min(from + blockSize - 1, totalRounds);
    const acc = new Map<string, { clubName: string; points: number; gf: number; ga: number }>();
    const bump = (clubId: string, clubName: string, gf: number, ga: number): void => {
      let a = acc.get(clubId);
      if (!a) { a = { clubName, points: 0, gf: 0, ga: 0 }; acc.set(clubId, a); }
      a.points += gf > ga ? 3 : gf === ga ? 1 : 0;
      a.gf += gf; a.ga += ga;
    };
    for (let i = 0; i < results.length && i < fixtures.length; i++) {
      const fx = fixtures[i]!;
      if (fx.round < from || fx.round > to) continue;
      const r = results[i]!;
      bump(r.homeClubId, r.homeClubName, r.score[0], r.score[1]);
      bump(r.awayClubId, r.awayClubName, r.score[1], r.score[0]);
    }
    if (acc.size === 0) continue;
    const [bestId, best] = [...acc.entries()]
      .sort((a, b) => b[1].points - a[1].points
        || (b[1].gf - b[1].ga) - (a[1].gf - a[1].ga)
        || b[1].gf - a[1].gf)[0]!;
    awards.push({
      blockIndex: awards.length + 1, fromRound: from, toRound: to,
      clubId: bestId, clubName: best.clubName, points: best.points,
      gd: best.gf - best.ga, gf: best.gf,
    });
  }
  return awards;
}

export interface MonthlyPlayerAward {
  /** 블록 순번(1부터) — monthlyManagerAwards와 동일한 라운드 구간. */
  blockIndex: number;
  fromRound: number;
  toRound: number;
  playerId: string;
  name: string;
  clubId: string;
  clubName: string;
  avgRating: number;
  apps: number;
}

/**
 * 이달의 선수(고도화 항목37) — monthlyManagerAwards와 동일하게 라운드를
 * blockSize개씩 묶어, 그 구간에 minApps경기 이상 출전한 선수 중 평균 평점
 * 최고인 선수를 뽑는다(동률이면 출전 수, 그다음 이름순으로 결정론적으로 결정).
 */
export function monthlyPlayerAwards(
  fixtures: Fixture[], results: MatchResult[], blockSize = 4, minApps = 2,
): MonthlyPlayerAward[] {
  const totalRounds = fixtures.reduce((m, f) => Math.max(m, f.round), 0);
  const awards: MonthlyPlayerAward[] = [];
  for (let from = 1; from <= totalRounds; from += blockSize) {
    const to = Math.min(from + blockSize - 1, totalRounds);
    const acc = new Map<string, { name: string; clubId: string; clubName: string; totalRating: number; apps: number }>();
    const bump = (clubId: string, clubName: string, stats: { playerId: string; name: string; rating: number }[]) => {
      for (const s of stats) {
        let a = acc.get(s.playerId);
        if (!a) { a = { name: s.name, clubId, clubName, totalRating: 0, apps: 0 }; acc.set(s.playerId, a); }
        a.totalRating += s.rating; a.apps += 1;
      }
    };
    for (let i = 0; i < results.length && i < fixtures.length; i++) {
      const fx = fixtures[i]!;
      if (fx.round < from || fx.round > to) continue;
      const r = results[i]!;
      bump(r.homeClubId, r.homeClubName, r.playerStats.home);
      bump(r.awayClubId, r.awayClubName, r.playerStats.away);
    }
    const eligible = [...acc.entries()].filter(([, a]) => a.apps >= minApps);
    if (eligible.length === 0) continue;
    const [bestId, best] = eligible.sort((a, b) =>
      (b[1].totalRating / b[1].apps) - (a[1].totalRating / a[1].apps)
      || b[1].apps - a[1].apps
      || a[1].name.localeCompare(b[1].name))[0]!;
    awards.push({
      blockIndex: awards.length + 1, fromRound: from, toRound: to,
      playerId: bestId, name: best.name, clubId: best.clubId, clubName: best.clubName,
      avgRating: best.totalRating / best.apps, apps: best.apps,
    });
  }
  return awards;
}

export interface StreakSummary {
  /** 시즌 내 최장 연승. */
  winStreak: number;
  /** 시즌 내 최장 무패(승+무) 연속 기록. */
  unbeatenStreak: number;
}

/**
 * 특정 구단의 시즌 내 최장 연승·무패 기록(고도화 항목25).
 * results는 진행 순서(과거→최신)라고 가정 — venue 무관, 실제 경기 순서 그대로 훑는다.
 */
export function longestStreaks(results: MatchResult[], clubId: string): StreakSummary {
  let winStreak = 0; let unbeatenStreak = 0;
  let curWin = 0; let curUnbeaten = 0;
  for (const r of results) {
    const isHome = r.homeClubId === clubId;
    const isAway = r.awayClubId === clubId;
    if (!isHome && !isAway) continue;
    const gf = isHome ? r.score[0] : r.score[1];
    const ga = isHome ? r.score[1] : r.score[0];
    if (gf > ga) {
      curWin++; curUnbeaten++;
    } else if (gf === ga) {
      curWin = 0; curUnbeaten++;
    } else {
      curWin = 0; curUnbeaten = 0;
    }
    winStreak = Math.max(winStreak, curWin);
    unbeatenStreak = Math.max(unbeatenStreak, curUnbeaten);
  }
  return { winStreak, unbeatenStreak };
}

export interface BiggestWin {
  margin: number;
  opponentName: string;
  myGoals: number;
  oppGoals: number;
}

/**
 * 시즌 내 특정 구단의 최다 득점차 승리(고도화 항목27). 승리한 경기가 없으면 undefined.
 * 득점차가 같으면 총 득점이 더 많은 경기를 우선한다.
 */
export function biggestWinMargin(results: MatchResult[], clubId: string): BiggestWin | undefined {
  let best: BiggestWin | undefined;
  for (const r of results) {
    const isHome = r.homeClubId === clubId;
    const isAway = r.awayClubId === clubId;
    if (!isHome && !isAway) continue;
    const myGoals = isHome ? r.score[0] : r.score[1];
    const oppGoals = isHome ? r.score[1] : r.score[0];
    if (myGoals <= oppGoals) continue;
    const margin = myGoals - oppGoals;
    if (!best || margin > best.margin || (margin === best.margin && myGoals > best.myGoals)) {
      best = { margin, opponentName: isHome ? r.awayClubName : r.homeClubName, myGoals, oppGoals };
    }
  }
  return best;
}

export interface WeatherRecordRow {
  weather: Weather;
  wins: number;
  draws: number;
  losses: number;
}

/**
 * 특정 구단의 시즌 내 날씨별 전적(고도화 항목40) — 맑음/비/강풍 각각의 승무패.
 * weather가 없는(구버전) 경기는 집계에서 제외한다. 경기 수가 0인 날씨는 결과에서 생략.
 */
export function weatherRecordByClub(results: MatchResult[], clubId: string): WeatherRecordRow[] {
  const tally = new Map<Weather, { wins: number; draws: number; losses: number }>();
  for (const r of results) {
    if (!r.weather) continue;
    const isHome = r.homeClubId === clubId;
    const isAway = r.awayClubId === clubId;
    if (!isHome && !isAway) continue;
    const gf = isHome ? r.score[0] : r.score[1];
    const ga = isHome ? r.score[1] : r.score[0];
    let row = tally.get(r.weather);
    if (!row) { row = { wins: 0, draws: 0, losses: 0 }; tally.set(r.weather, row); }
    if (gf > ga) row.wins++;
    else if (gf === ga) row.draws++;
    else row.losses++;
  }
  const order: Weather[] = ['clear', 'rain', 'windy'];
  return order
    .filter((w) => tally.has(w))
    .map((w) => ({ weather: w, ...tally.get(w)! }));
}

/** clubs 인자는 향후 확장용(현재는 결과만으로 충분). */
export function summarizeStats(results: MatchResult[], totalRounds: number): {
  topScorers: PlayerSeasonStat[];
  awards: SeasonAwards;
} {
  const stats = aggregatePlayerStats(results);
  const minApps = Math.max(1, Math.floor(totalRounds / 2));
  const awards = seasonAwards(stats, minApps);
  const mostMotm = motmTally(results)[0];
  return { topScorers: topScorers(stats, 10), awards: mostMotm ? { ...awards, mostMotm } : awards };
}

export interface CareerStat {
  playerId: string;
  name: string;
  clubId: string;
  clubName: string;
  position: string;
  age: number;
  /** 통산+이번 시즌 득점. */
  goals: number;
  /** 통산+이번 시즌 선발 출전. */
  apps: number;
}

/**
 * 현역 선수 통산 득점 순위(전 구단).
 * Player의 누적 기록(careerGoals/Apps) + 이번 시즌(seasonGoals/Apps)을 합산한다.
 */
export function careerScorers(clubs: Club[], n = 15): CareerStat[] {
  const out: CareerStat[] = [];
  for (const club of clubs) {
    for (const p of club.players) {
      const goals = (p.careerGoals ?? 0) + (p.seasonGoals ?? 0);
      const apps = (p.careerApps ?? 0) + p.seasonApps;
      if (goals === 0 && apps === 0) continue;
      out.push({
        playerId: p.id, name: p.name, clubId: club.id, clubName: club.name,
        position: p.position, age: p.age, goals, apps,
      });
    }
  }
  out.sort((a, b) => b.goals - a.goals || b.apps - a.apps);
  return out.slice(0, n);
}

export interface PlayerFormEntry {
  rating: number;
  goals: number;
  /** 상대 구단명. */
  opponentName: string;
  home: boolean;
}

/**
 * 특정 선수의 최근 n경기 평점 이력(과거→최신 순).
 * 출전하지 않은 경기는 건너뛴다.
 */
export function recentPlayerForm(results: MatchResult[], playerId: string, n = 5): PlayerFormEntry[] {
  const out: PlayerFormEntry[] = [];
  for (const r of results) {
    const home = r.playerStats.home.find((s) => s.playerId === playerId);
    const away = r.playerStats.away.find((s) => s.playerId === playerId);
    if (home) out.push({ rating: home.rating, goals: home.goals, opponentName: r.awayClubName, home: true });
    else if (away) out.push({ rating: away.rating, goals: away.goals, opponentName: r.homeClubName, home: false });
  }
  return out.slice(-n);
}

export interface SeasonSquadEntry {
  position: Position;
  playerId: string;
  name: string;
  age: number;
  avgRating: number;
  goals: number;
  assists: number;
}

/**
 * 시즌 스쿼드 스냅샷(트로피 캐비닛용). 전술 라인업 순서대로 선수 정보 +
 * 그 시즌 통계(평균 평점·득점)를 묶는다.
 * @param agesAtSeasonEnd 오프시즌(나이 증가·은퇴) 처리 전에 캡처한 playerId→나이 맵.
 *   문서로만 "오프시즌 전에 호출" 주의를 남기고 club.players에서 나이를 직접 읽으면,
 *   호출 순서가 바뀌었을 때 컴파일 에러 없이 조용히 나이가 1살 많게 기록된다 —
 *   호출자가 캡처 시점을 명시적으로 넘기도록 강제해 그 실수 자체를 차단한다.
 */
export function seasonSquadSnapshot(
  tactic: Tactic, club: Club, stats: PlayerSeasonStat[], agesAtSeasonEnd: Map<string, number>,
): SeasonSquadEntry[] {
  const statById = new Map(stats.map((s) => [s.playerId, s]));
  const playerById = new Map(club.players.map((p) => [p.id, p]));
  return tactic.lineup.map((slot) => {
    const player = playerById.get(slot.playerId);
    const st = statById.get(slot.playerId);
    return {
      position: slot.position,
      playerId: slot.playerId,
      name: player?.name ?? st?.name ?? '알 수 없음',
      age: agesAtSeasonEnd.get(slot.playerId) ?? player?.age ?? 0,
      avgRating: st?.avgRating ?? 0,
      goals: st?.goals ?? 0,
      assists: st?.assists ?? 0,
    };
  });
}
