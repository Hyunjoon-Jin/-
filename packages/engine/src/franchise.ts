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
  const { table } = simulateSeason(clubs, baseSeed + 2);

  // 3) 재정 정산 (순위별)
  const finance = new Map<string, SeasonFinanceReport>();
  table.forEach((row, pos) => {
    const club = clubs.find((c) => c.id === row.clubId)!;
    finance.set(club.id, settleSeason(club, pos, clubs.length));
  });

  // 4) 성장/노화 + 5) 은퇴·유스 유입
  let retirements = 0;
  for (const club of clubs) {
    for (const player of club.players) progressPlayer(player, rng);

    const survivors: Player[] = [];
    const retiredPositions: Position[] = [];
    for (const p of club.players) {
      if (p.age >= RETIRE_AGE) retiredPositions.push(p.position);
      else survivors.push(p);
    }
    // 은퇴한 만큼 같은 포지션 유스로 충원 (스쿼드 크기 유지)
    for (const pos of retiredPositions) {
      survivors.push(generateYouthPlayer(rng, pos, club.finance.reputation));
      retirements++;
    }
    club.players = survivors;
  }

  const champ = table[0]!;
  return {
    season,
    table,
    championId: champ.clubId,
    championName: champ.name,
    transfers,
    finance,
    retirements,
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
