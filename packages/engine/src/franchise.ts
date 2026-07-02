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
import { generateAcademyIntake } from './generate.js';
import { enforceFinancialFairPlay } from './financeControl.js';
import { runInternationalBreak } from './international.js';
import { currentAbility } from './derived.js';
import { hasTrait } from './traits.js';
import { clamp } from './math.js';
import {
  summarizeStats, type PlayerSeasonStat, type SeasonAwards, type SeasonSquadEntry,
} from './stats.js';
import { Rng } from './rng.js';

/** 스쿼드 상한(오프시즌 정리 목표). MAX_SQUAD보다 낮게 유지. */
const SOFT_CAP = 26;

/** 이 나이 이상이면 시즌 후 은퇴. */
const RETIRE_AGE = 37;

/** 통산 마일스톤 임계값(출전/득점). 이 값을 이번 시즌에 처음 넘으면 기록. */
const MILESTONE_APPS = [50, 100, 150, 200, 250, 300];
const MILESTONE_GOALS = [10, 25, 50, 100, 150, 200];

export type MilestoneKind = 'apps' | 'goals';

/** 통산 마일스톤 달성(이번 시즌에 처음 임계값을 넘은 경우). */
export interface CareerMilestone {
  playerId: string;
  name: string;
  clubId: string;
  clubName: string;
  kind: MilestoneKind;
  /** 달성한 임계값(예: 100). */
  value: number;
}

/** before < t ≤ after 인 임계값들(이번 시즌에 새로 넘은 것만). */
function crossedThresholds(before: number, after: number, thresholds: number[]): number[] {
  return thresholds.filter((t) => before < t && after >= t);
}

export type DebutEventKind = 'debut' | 'firstGoal';

/** 선수의 첫 출전/첫 골(통산 기록이 이번 시즌에 0→양수로 처음 전환된 경우). */
export interface DebutEvent {
  playerId: string;
  name: string;
  clubId: string;
  clubName: string;
  kind: DebutEventKind;
}

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
  /** 앱: 이 시즌 내 구단이 속했던 부(0=1부, 1=2부). */
  division?: number;
  /** 앱: 이 시즌 결과로 내 구단 승격/강등 여부. */
  promoted?: boolean;
  relegated?: boolean;
  topScorers: PlayerSeasonStat[];
  awards: SeasonAwards;
  /** 컵 우승 구단(앱의 병행 컵대회). 헤드리스 프랜차이즈에선 미설정. */
  cupChampionId?: string;
  cupChampionName?: string;
  /** 국가대표 차출 인원(내 구단 기준, 앱). */
  nationalCallUps?: number;
  /** 국가대표 차출 중 부상 인원(내 구단 기준, 앱). */
  nationalInjuries?: number;
  /** 이사회 특별 요구 결과(앱). */
  demand?: { label: string; met: boolean };
  /** 내 구단 시즌 스쿼드 스냅샷(트로피 캐비닛용, 앱). */
  squad?: SeasonSquadEntry[];
  /** 내 구단 선수의 이번 시즌 통산 마일스톤 달성(앱). */
  milestones?: CareerMilestone[];
  /** 시즌 시작 시 언론 예상 순위(전술 XI 평균 CA 기준, 앱). */
  preseasonRank?: number;
  /** 예상 순위 대비 실제 성적 이변 여부(앱). 예상보다 크게 잘하면 overperform, 크게 못하면 underperform. */
  surprise?: 'overperform' | 'underperform';
  /** 내 구단 유스 아카데미가 이번 시즌 배출한 유망주(앱). */
  youthProspects?: YouthProspect[];
  /** 과거 시즌 유스 기대주로 소개됐던 선수의 이번 시즌 데뷔/첫 골 소식(앱). */
  prospectUpdates?: YouthProspectUpdate[];
}

/** 과거 유스 기대주 소개 이후의 후속 소식(데뷔/첫 골). */
export interface YouthProspectUpdate {
  playerId: string;
  name: string;
  kind: DebutEventKind;
}

/** 유스 아카데미 배출 유망주 소개용 요약 정보. */
export interface YouthProspect {
  playerId: string;
  name: string;
  position: Position;
  age: number;
  potential: number;
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

/** 은퇴 시점 스냅샷(레전드 아카이브용). 은퇴로 선수 객체 자체는 사라지므로 여기 보존. */
export interface RetiredLegend {
  playerId: string;
  name: string;
  position: Position;
  clubId: string;
  clubName: string;
  /** 은퇴 시즌 나이. */
  finalAge: number;
  careerApps: number;
  careerGoals: number;
  caps: number;
}

export interface OffseasonResult {
  retirements: number;
  /** clubId → 유스 아카데미 배출 인원. */
  intakeByClub: Map<string, number>;
  /** clubId → 이번 오프시즌에 새로 배출된 유스 선수(스쿼드 상한 정리 전). */
  intakePlayersByClub: Map<string, Player[]>;
  /** clubId → 재정 위기 강제 매각 인원. */
  fireSalesByClub: Map<string, number>;
  /** 이번 오프시즌에 은퇴한 선수 스냅샷(전 구단). */
  retiredPlayers: RetiredLegend[];
  /** 이번 오프시즌에 처음 임계값을 넘은 통산 마일스톤(전 구단). */
  milestones: CareerMilestone[];
  /** 이번 오프시즌에 처음 데뷔(첫 출전)하거나 첫 골을 기록한 선수(전 구단). */
  debutEvents: DebutEvent[];
}

export function runOffseason(clubs: Club[], rng: Rng): OffseasonResult {
  let retirements = 0;
  const intakeByClub = new Map<string, number>();
  const intakePlayersByClub = new Map<string, Player[]>();
  const fireSalesByClub = new Map<string, number>();
  const retiredPlayers: RetiredLegend[] = [];
  const milestones: CareerMilestone[] = [];
  const debutEvents: DebutEvent[] = [];
  const expectedMatches = 2 * (clubs.length - 1); // 리그 기준 기대 출전
  for (const club of clubs) {
    // 스쿼드 중간 능력(주전 기대치 판단용)
    const cas = club.players.map(currentAbility).sort((a, b) => a - b);
    const medianCA = cas[Math.floor(cas.length / 2)] ?? 0;
    // 리더 특성 보유 선수가 있으면 스쿼드 전체 사기가 소폭 상승.
    const leaderBonus = club.players.some((p) => hasTrait(p, 'leader')) ? 0.05 : 0;

    for (const player of club.players) {
      // 출전 시간 기반 사기 갱신 (핵심 선수가 벤치면 불만)
      const ratio = Math.min(1, player.seasonApps / Math.max(1, expectedMatches));
      const key = currentAbility(player) >= medianCA;
      let target = 0.55;
      if (ratio >= 0.55) target = 0.8;
      else if (ratio < 0.25 && key) target = 0.3;
      else if (ratio < 0.25) target = 0.5;
      player.morale = clamp(0.4 * player.morale + 0.6 * (target + leaderBonus), 0, 1);

      progressPlayer(player, rng, club.staff.coaching);
      // 성장 곡선: 이번 시즌 종료 시점 CA 스냅샷(최근 20시즌 유지)
      const hist = player.caHistory ?? (player.caHistory = []);
      hist.push(Math.round(currentAbility(player)));
      if (hist.length > 20) hist.shift();
      // 통산 기록 누적(이번 시즌에 처음 임계값을 넘으면 마일스톤 기록) 후 시즌 카운터 리셋
      const beforeApps = player.careerApps ?? 0;
      const beforeGoals = player.careerGoals ?? 0;
      player.careerApps = beforeApps + player.seasonApps;
      player.careerGoals = beforeGoals + (player.seasonGoals ?? 0);
      for (const value of crossedThresholds(beforeApps, player.careerApps, MILESTONE_APPS)) {
        milestones.push({ playerId: player.id, name: player.name, clubId: club.id, clubName: club.name, kind: 'apps', value });
      }
      for (const value of crossedThresholds(beforeGoals, player.careerGoals, MILESTONE_GOALS)) {
        milestones.push({ playerId: player.id, name: player.name, clubId: club.id, clubName: club.name, kind: 'goals', value });
      }
      // 데뷔/첫 골(통산 기록이 이번 시즌에 처음 0에서 넘어간 경우만 — 재시즌 반복 방지)
      if (beforeApps === 0 && player.seasonApps > 0) {
        debutEvents.push({ playerId: player.id, name: player.name, clubId: club.id, clubName: club.name, kind: 'debut' });
      }
      if (beforeGoals === 0 && (player.seasonGoals ?? 0) > 0) {
        debutEvents.push({ playerId: player.id, name: player.name, clubId: club.id, clubName: club.name, kind: 'firstGoal' });
      }
      // 새 시즌은 풀 컨디션·부상/징계 리셋으로 시작
      player.condition = 1;
      player.injuryMatches = 0;
      player.injuryName = undefined;
      player.yellowCards = 0;
      player.suspensionMatches = 0;
      player.seasonApps = 0;
      player.seasonGoals = 0;
    }

    // 은퇴 (스냅샷 보존 후 제거 — 통산 기록은 은퇴와 함께 사라지므로 여기서 캡처)
    club.players = club.players.filter((p) => {
      if (p.age >= RETIRE_AGE) {
        retirements++;
        retiredPlayers.push({
          playerId: p.id, name: p.name, position: p.position,
          clubId: club.id, clubName: club.name, finalAge: p.age,
          careerApps: p.careerApps ?? 0, careerGoals: p.careerGoals ?? 0, caps: p.caps ?? 0,
        });
        return false;
      }
      return true;
    });

    // 재정 위기 시 강제 매각(파이낸셜 페어플레이)
    const fire = enforceFinancialFairPlay(club);
    fireSalesByClub.set(club.id, fire.sold.length);

    // 유스 아카데미 배출
    const intake = generateAcademyIntake(rng, club.finance.reputation, club.staff.youth);
    club.players.push(...intake);
    intakeByClub.set(club.id, intake.length);
    intakePlayersByClub.set(club.id, intake);

    // 스쿼드 상한 정리
    trimSquad(club);
  }
  return { retirements, intakeByClub, intakePlayersByClub, fireSalesByClub, retiredPlayers, milestones, debutEvents };
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

  // 5) 국가대표 차출(오프시즌 리셋 이후 — 피로/부상이 새 시즌에 반영)
  runInternationalBreak(clubs, rng);

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
