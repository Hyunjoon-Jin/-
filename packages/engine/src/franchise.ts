/**
 * 멀티시즌 프랜차이즈 루프 (design.md 5장: 시즌 루프).
 * 한 시즌 = 이적 창 → 리그 경기 → 재정 정산 → 선수 성장/노화 → 은퇴·유스 유입.
 * 게임의 시간축을 닫는 핵심 루프.
 */
import type { Club } from './types.js';
import { simulateSeason, type TableRow } from './league.js';
import { settleSeason, type SeasonFinanceReport } from './finance.js';
import { runTransferWindow, type TransferDeal } from './transfer.js';
import { progressPlayer } from './progression.js';
import { generateAcademyIntake } from './generate.js';
import { enforceFinancialFairPlay } from './financeControl.js';
import { currentAbility } from './derived.js';
import { summarizeStats, type PlayerSeasonStat, type SeasonAwards } from './stats.js';
import { Rng } from './rng.js';

/** 스쿼드 상한(오프시즌 정리 목표). MAX_SQUAD보다 낮게 유지. */
const SOFT_CAP = 26;

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
  /** 앱: 내 구단 유스 승격 인원(헤드리스에선 미설정). */
  youthPromotions?: number;
  /** 앱: 내 구단 재정 위기 강제 매각 인원. */
  fireSales?: number;
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
/** 스쿼드를 상한까지 정리: 21세 이상 중 가장 약한 선수부터 방출(유스 보호). */
function trimSquad(club: Club): void {
  while (club.players.length > SOFT_CAP) {
    const established = club.players.filter((p) => p.age >= 21);
    const pool = established.length > 0 ? established : club.players;
    const weakest = pool.reduce((a, b) => (currentAbility(a) < currentAbility(b) ? a : b));
    club.players = club.players.filter((p) => p.id !== weakest.id);
  }
}

export interface OffseasonResult {
  retirements: number;
  /** clubId → 유스 아카데미 배출 인원. */
  intakeByClub: Map<string, number>;
  /** clubId → 재정 위기 강제 매각 인원. */
  fireSalesByClub: Map<string, number>;
}

export function runOffseason(clubs: Club[], rng: Rng): OffseasonResult {
  let retirements = 0;
  const intakeByClub = new Map<string, number>();
  const fireSalesByClub = new Map<string, number>();
  for (const club of clubs) {
    for (const player of club.players) {
      progressPlayer(player, rng, club.staff.coaching);
      // 새 시즌은 풀 컨디션·부상/징계 리셋으로 시작, 사기는 중립으로 회귀
      player.condition = 1;
      player.injuryMatches = 0;
      player.yellowCards = 0;
      player.suspensionMatches = 0;
      player.morale = 0.5 + (player.morale - 0.5) * 0.4;
    }

    // 은퇴
    club.players = club.players.filter((p) => {
      if (p.age >= RETIRE_AGE) { retirements++; return false; }
      return true;
    });

    // 재정 위기 시 강제 매각(파이낸셜 페어플레이)
    const fire = enforceFinancialFairPlay(club);
    fireSalesByClub.set(club.id, fire.sold.length);

    // 유스 아카데미 배출
    const intake = generateAcademyIntake(rng, club.finance.reputation, club.staff.youth);
    club.players.push(...intake);
    intakeByClub.set(club.id, intake.length);

    // 스쿼드 상한 정리
    trimSquad(club);
  }
  return { retirements, intakeByClub, fireSalesByClub };
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

  // 4) 오프시즌: 성장/노화 + 은퇴·유스 아카데미
  const { retirements } = runOffseason(clubs, rng);

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
