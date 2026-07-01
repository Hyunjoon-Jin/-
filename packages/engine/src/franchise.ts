/**
 * 멀티시즌 프랜차이즈 루프 (design.md 5장: 시즌 루프).
 * 한 시즌 = 이적 창 → 리그 경기 → 재정 정산 → 선수 성장/노화 → 은퇴·유스 유입.
 * 게임의 시간축을 닫는 핵심 루프.
 */
import type { Club, Player, Position } from './types.js';
import { simulateSeason, type TableRow } from './league.js';
import { settleSeason, type SeasonFinanceReport } from './finance.js';
import { runTransferWindow, type TransferDeal } from './transfer.js';
import { progressPlayer } from './progression.js';
import { generateYouthPlayer } from './generate.js';
import { summarizeStats, type PlayerSeasonStat, type SeasonAwards } from './stats.js';
import { Rng } from './rng.js';

/** 이 나이 이상이면 시즌 후 은퇴. */
const RETIRE_AGE = 37;

export interface SeasonSummary {
  season: number;
  table: TableRow[];
  championId: string;
  championName: string;
  transfers: TransferDeal[];
  finance: Map<string, SeasonFinanceReport>;
  retirements: number;
  topScorers: PlayerSeasonStat[];
  awards: SeasonAwards;
  /** 컵 우승 구단(앱의 병행 컵대회). 헤드리스 프랜차이즈에선 미설정. */
  cupChampionId?: string;
  cupChampionName?: string;
}

/**
 * 오프시즌 진행: 전 선수 성장/노화 + 은퇴(유스 1:1 충원).
 * 헤드리스 루프와 앱(경기 단위 진행)이 시즌 종료 시 공통으로 호출한다.
 * @returns 은퇴(=유스 충원) 인원.
 */
export function runOffseason(clubs: Club[], rng: Rng): number {
  let retirements = 0;
  for (const club of clubs) {
    for (const player of club.players) {
      progressPlayer(player, rng, club.staff.coaching);
      // 새 시즌은 풀 컨디션·부상 회복으로 시작, 사기는 중립으로 회귀
      player.condition = 1;
      player.injuryMatches = 0;
      player.morale = 0.5 + (player.morale - 0.5) * 0.4;
    }

    const survivors: Player[] = [];
    const retiredPositions: Position[] = [];
    for (const p of club.players) {
      if (p.age >= RETIRE_AGE) retiredPositions.push(p.position);
      else survivors.push(p);
    }
    for (const pos of retiredPositions) {
      survivors.push(generateYouthPlayer(rng, pos, club.finance.reputation));
      retirements++;
    }
    club.players = survivors;
  }
  return retirements;
}

/**
 * 한 시즌 진행. clubs 객체(선수단·재정·선수 능력치)가 직접 변경된다.
 * @param baseSeed 시즌별로 다른 시드를 넣어 재현성을 유지한다.
 */
export function advanceSeason(clubs: Club[], season: number, baseSeed: number): SeasonSummary {
  const rng = new Rng(baseSeed);

  // 1) 이적 창 (프리시즌)
  const transfers = runTransferWindow(clubs, baseSeed + 1);

  // 2) 리그 경기
  const { table, matches } = simulateSeason(clubs, baseSeed + 2);
  const { topScorers, awards } = summarizeStats(matches, 2 * (clubs.length - 1));

  // 3) 재정 정산 (순위별)
  const finance = new Map<string, SeasonFinanceReport>();
  table.forEach((row, pos) => {
    const club = clubs.find((c) => c.id === row.clubId)!;
    finance.set(club.id, settleSeason(club, pos, clubs.length));
  });

  // 4) 오프시즌: 성장/노화 + 은퇴·유스 유입
  const retirements = runOffseason(clubs, rng);

  const champ = table[0]!;
  return {
    season,
    table,
    championId: champ.clubId,
    championName: champ.name,
    transfers,
    finance,
    retirements,
    topScorers,
    awards,
  };
}

/**
 * N시즌 연속 진행.
 * @returns 시즌별 요약 배열.
 */
export function runFranchise(clubs: Club[], seasons: number, baseSeed: number): SeasonSummary[] {
  const out: SeasonSummary[] = [];
  for (let s = 1; s <= seasons; s++) {
    out.push(advanceSeason(clubs, s, baseSeed + s * 1000));
  }
  return out;
}
