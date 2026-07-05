/**
 * 리저브팀 자체 소규모 리그(가상 매치) — 신규 개선 항목 14.
 * 1군 리그와 별개로, 클럽별 리저브(2군) 스쿼드끼리 매 시즌 한 번씩 더블 라운드로빈
 * 가상 매치를 일괄 시뮬레이션한다. 실제 인게임 관전은 없고 결과만 순위표로 집계된다.
 * 1군 경기 기록(seasonApps 등)을 오염시키지 않도록 applyMatchEffects는 재사용하지 않고
 * (international.ts의 비정기 국제대회와 같은 관례), 우승 스쿼드에게만 경량 사기 보너스를
 * 직접 부여한다.
 */
import type { Club } from './types.js';
import { doubleRoundRobin } from './schedule.js';
import { defaultTactic } from './generate.js';
import { simulateMatchWithAiTactics } from './aiInMatch.js';
import { clamp } from './math.js';

/** 리저브 리그에 참가하려면 최소 이 인원 이상 보유해야 한다(포메이션 구성 가능한 최소치). */
export const MIN_RESERVE_SQUAD = 14;

/** 리저브 리그 우승 스쿼드 전원에게 부여하는 일회성 사기 보너스. */
export const RESERVE_LEAGUE_CHAMPION_MORALE_BOOST = 0.05;

export interface ReserveTableRow {
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

export interface ReserveLeagueResult {
  /** 참가 자격(MIN_RESERVE_SQUAD 이상)을 갖춘 구단들의 순위표(승점순). 미달 구단은 아예 빠진다. */
  table: ReserveTableRow[];
}

/** 리저브 스쿼드를 simulateMatch가 받아들이는 Club 형태로 감싼다(선수단만 교체, 재정/스태프는 원 구단 그대로). */
function buildReserveTeam(club: Club): Club {
  return { ...club, id: `reserve:${club.id}`, players: club.reserves ?? [] };
}

function emptyRow(club: Club): ReserveTableRow {
  return {
    clubId: club.id, name: club.name, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0,
  };
}

/**
 * 참가 자격을 갖춘 구단의 리저브 스쿼드끼리 더블 라운드로빈으로 한 시즌치 가상 매치를
 * 한 번에 치른다(실시간 관전 없이 즉시 전 경기 시뮬레이션).
 * @param baseSeed 경기별 시드는 baseSeed + 경기 인덱스로 파생(재현성 유지 — 1군 리그 시드와는 다른 값을 넘겨야 함).
 */
export function simulateReserveSeason(clubs: Club[], baseSeed: number): ReserveLeagueResult {
  const eligible = clubs.filter((c) => (c.reserves?.length ?? 0) >= MIN_RESERVE_SQUAD);
  if (eligible.length < 2) return { table: [] };

  const fixtures = doubleRoundRobin(eligible.map((c) => c.id));
  const byId = new Map(eligible.map((c) => [c.id, c]));
  const rows = new Map(eligible.map((c) => [c.id, emptyRow(c)]));

  fixtures.forEach((fx, i) => {
    const homeClub = byId.get(fx.homeId)!;
    const awayClub = byId.get(fx.awayId)!;
    const home = buildReserveTeam(homeClub);
    const away = buildReserveTeam(awayClub);
    const result = simulateMatchWithAiTactics({
      home: { club: home, tactic: defaultTactic(home, { opponent: away, isHome: true }) },
      away: { club: away, tactic: defaultTactic(away, { opponent: home, isHome: false }) },
      seed: baseSeed + i,
    });
    const [hg, ag] = result.score;
    const hr = rows.get(fx.homeId)!;
    const ar = rows.get(fx.awayId)!;
    hr.played++; ar.played++;
    hr.gf += hg; hr.ga += ag;
    ar.gf += ag; ar.ga += hg;
    if (hg > ag) { hr.won++; hr.points += 3; ar.lost++; }
    else if (hg < ag) { ar.won++; ar.points += 3; hr.lost++; }
    else { hr.drawn++; ar.drawn++; hr.points++; ar.points++; }
  });

  const table = [...rows.values()].sort((a, b) => {
    const byPoints = b.points - a.points;
    if (byPoints !== 0) return byPoints;
    const byGd = (b.gf - b.ga) - (a.gf - a.ga);
    if (byGd !== 0) return byGd;
    const byGf = b.gf - a.gf;
    if (byGf !== 0) return byGf;
    return a.clubId.localeCompare(b.clubId);
  });

  const champion = table[0];
  if (champion) {
    for (const p of byId.get(champion.clubId)!.reserves ?? []) {
      p.morale = clamp(p.morale + RESERVE_LEAGUE_CHAMPION_MORALE_BOOST, 0, 1);
    }
  }

  return { table };
}
