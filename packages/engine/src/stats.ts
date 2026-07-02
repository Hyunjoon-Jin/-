/**
 * 시즌 선수 통계 집계 + 어워드 (표현 심화).
 * 경기 결과(MatchResult.playerStats)를 모아 출전·득점·평균 평점을 산출하고,
 * 득점왕·시즌 베스트 플레이어를 뽑는다.
 */
import type { Club, MatchResult, Position, Tactic } from './types.js';

export interface PlayerSeasonStat {
  playerId: string;
  name: string;
  clubId: string;
  clubName: string;
  apps: number;
  goals: number;
  shots: number;
  avgRating: number;
}

export interface SeasonAwards {
  topScorer?: { playerId: string; name: string; clubName: string; goals: number };
  playerOfSeason?: { playerId: string; name: string; clubName: string; avgRating: number };
}

interface Acc {
  playerId: string; name: string; clubId: string; clubName: string;
  apps: number; goals: number; shots: number; totalRating: number;
}

/** 시즌 전 경기 결과에서 선수별 통계 집계. */
export function aggregatePlayerStats(results: MatchResult[]): PlayerSeasonStat[] {
  const map = new Map<string, Acc>();
  const add = (
    st: MatchResult['playerStats']['home'][number], clubId: string, clubName: string,
  ) => {
    let a = map.get(st.playerId);
    if (!a) {
      a = { playerId: st.playerId, name: st.name, clubId, clubName, apps: 0, goals: 0, shots: 0, totalRating: 0 };
      map.set(st.playerId, a);
    }
    // 이적으로 소속이 바뀌면 최신 소속으로 갱신
    a.clubId = clubId; a.clubName = clubName;
    a.apps++;
    a.goals += st.goals;
    a.shots += st.shots;
    a.totalRating += st.rating;
  };
  for (const r of results) {
    for (const st of r.playerStats.home) add(st, r.homeClubId, r.homeClubName);
    for (const st of r.playerStats.away) add(st, r.awayClubId, r.awayClubName);
  }
  return [...map.values()].map((a) => ({
    playerId: a.playerId, name: a.name, clubId: a.clubId, clubName: a.clubName,
    apps: a.apps, goals: a.goals, shots: a.shots,
    avgRating: a.apps > 0 ? a.totalRating / a.apps : 0,
  }));
}

/** 득점 → 평균 평점 → 출전 순 정렬. */
export function topScorers(stats: PlayerSeasonStat[], n = 10): PlayerSeasonStat[] {
  return [...stats]
    .sort((a, b) => b.goals - a.goals || b.avgRating - a.avgRating || b.apps - a.apps)
    .slice(0, n);
}

/** 최소 출전 이상에서 평균 평점 최고 = 시즌 베스트 플레이어. */
export function playerOfSeason(stats: PlayerSeasonStat[], minApps: number): PlayerSeasonStat | undefined {
  return [...stats]
    .filter((s) => s.apps >= minApps)
    .sort((a, b) => b.avgRating - a.avgRating || b.goals - a.goals)[0];
}

/** 시즌 어워드 산출. minApps는 보통 (총 라운드의 절반). */
export function seasonAwards(stats: PlayerSeasonStat[], minApps: number): SeasonAwards {
  const scorer = topScorers(stats, 1)[0];
  const potm = playerOfSeason(stats, minApps);
  return {
    topScorer: scorer && scorer.goals > 0
      ? { playerId: scorer.playerId, name: scorer.name, clubName: scorer.clubName, goals: scorer.goals }
      : undefined,
    playerOfSeason: potm
      ? { playerId: potm.playerId, name: potm.name, clubName: potm.clubName, avgRating: potm.avgRating }
      : undefined,
  };
}

/** clubs 인자는 향후 확장용(현재는 결과만으로 충분). */
export function summarizeStats(results: MatchResult[], totalRounds: number): {
  topScorers: PlayerSeasonStat[];
  awards: SeasonAwards;
} {
  const stats = aggregatePlayerStats(results);
  const minApps = Math.max(1, Math.floor(totalRounds / 2));
  return { topScorers: topScorers(stats, 10), awards: seasonAwards(stats, minApps) };
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
}

/**
 * 시즌 스쿼드 스냅샷(트로피 캐비닛용). 전술 라인업 순서대로 선수 정보 +
 * 그 시즌 통계(평균 평점·득점)를 묶는다. 오프시즌(나이 증가·은퇴) 전에 호출해야
 * "그 시즌 당시" 나이가 기록된다.
 */
export function seasonSquadSnapshot(
  tactic: Tactic, club: Club, stats: PlayerSeasonStat[],
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
      age: player?.age ?? 0,
      avgRating: st?.avgRating ?? 0,
      goals: st?.goals ?? 0,
    };
  });
}
