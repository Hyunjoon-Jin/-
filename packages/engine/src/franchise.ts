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
import { generateAcademyIntake, generateYouthPlayer, assignSquadNumber } from './generate.js';
import { applyLoanWageSubsidies } from './transferActions.js';
import { enforceFinancialFairPlay } from './financeControl.js';
import { runInternationalBreak } from './international.js';
import { currentAbility } from './derived.js';
import { hasTrait } from './traits.js';
import { lineOf } from './teamStrength.js';
import { effectiveCoaching, effectiveYouth, effectiveScouting, tickStaffContracts } from './staffActions.js';
import { recentForm } from './form.js';
import { clamp } from './math.js';
import {
  summarizeStats, type PlayerSeasonStat, type SeasonAwards, type SeasonSquadEntry,
} from './stats.js';
import { Rng } from './rng.js';

/** 스쿼드 상한(오프시즌 정리 목표). MAX_SQUAD보다 낮게 유지. */
const SOFT_CAP = 26;

/** 이 나이부터 확률적 은퇴 곡선이 시작된다(자연회복력이 높을수록 은퇴 확률이 줄어든다). */
export const RETIRE_MIN_AGE = 33;
/** 이 나이 이상이면 무조건 은퇴(하드컷) — 만년 레전드도 여기서는 끝난다. */
const RETIRE_HARD_AGE = 42;

/** 나이·자연회복력에 따른 시즌 후 은퇴 확률(33세=6%, 37세=30%, 41세=54% 기준, 자연회복력으로 최대 40% 경감). */
export function retireChance(age: number, naturalFitness: number): number {
  if (age < RETIRE_MIN_AGE) return 0;
  const base = (age - RETIRE_MIN_AGE + 1) * 0.06;
  const fitnessRelief = (naturalFitness / 20) * 0.4;
  return clamp(base * (1 - fitnessRelief), 0, 0.95);
}

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
  /** 스폰서 보너스 목표 결과(앱). */
  sponsorGoal?: { label: string; met: boolean; bonus: number };
  /** 2부 3~6위 승격 플레이오프 결과(앱). 미니 토너먼트 우승 구단이 마지막 승격 자리를 얻는다. */
  promotionPlayoff?: {
    participants: { clubId: string; clubName: string }[];
    championId: string;
    championName: string;
  };
  /** 이번 오프시즌 내 구단 관련 임대 복귀(보낸 임대가 돌아오거나, 데려온 임대가 복귀). */
  loanReturns?: LoanReturnEvent[];
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
/** 스쿼드를 상한까지 정리: 21세 이상 중 가장 약한 선수부터 방출(유스 보호).
 *  전원 21세 미만인 극단적 리빌드 상황이면 유스 보호가 무력화되지 않도록
 *  이번 시즌 정리를 건너뛴다(다음 시즌에 성숙한 선수가 생기면 재개). */
function trimSquad(club: Club): void {
  while (club.players.length > SOFT_CAP) {
    const established = club.players.filter((p) => p.age >= 21);
    if (established.length === 0) break;
    const weakest = established.reduce((a, b) => (currentAbility(a) < currentAbility(b) ? a : b));
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

/** 임대 복귀 이벤트(오프시즌에 임대 기간이 끝나 원 소속 구단으로 돌아간 선수). */
export interface LoanReturnEvent {
  playerId: string;
  name: string;
  position: Position;
  fromClubId: string;
  fromClubName: string;
  toClubId: string;
  toClubName: string;
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
  /** 이번 오프시즌에 임대 기간이 끝나 원 소속 구단으로 복귀한 선수(전 구단). */
  loanReturns: LoanReturnEvent[];
}

/** 멘토링 보너스 배율 — 같은 라인에 리더 특성 보유자나 리더십 높은 베테랑이 있으면 성장 가속. */
const MENTOR_GROWTH_MUL = 1.15;
/** 멘토링 대상은 아직 성장 중인 유망주(23세 이하)만. */
const MENTEE_MAX_AGE = 23;
/** "리더십 높은 베테랑" 기준(리더 특성이 없어도 이 조건이면 멘토 자격). */
const MENTOR_VETERAN_AGE = 30;
const MENTOR_VETERAN_LEADERSHIP = 14;

/** 오프시즌 사기 수렴 시 기존 사기에 두는 가중치(기본) — 낮을수록 목표치로 빨리 수렴. */
const BASE_MORALE_RETENTION = 0.4;
/** 라커룸 마찰(다혈질 2명 이상 + 리더 부재) 시의 가중치 — 목표치로의 수렴이 둔화된다. */
const FRICTION_MORALE_RETENTION = 0.55;
/** 이 인원 이상의 다혈질 특성 보유자가 한 스쿼드에 있으면 마찰이 발생한다. */
const HOTHEAD_FRICTION_THRESHOLD = 2;

/** 성장 중인 유망주와 같은 라인에 멘토(리더 특성 또는 리더십 높은 베테랑)가 있는지. */
function hasMentor(club: Club, player: Player): boolean {
  if (player.age > MENTEE_MAX_AGE) return false;
  const line = lineOf(player.position);
  return club.players.some((p) => {
    if (p.id === player.id || lineOf(p.position) !== line) return false;
    return hasTrait(p, 'leader') || (p.age >= MENTOR_VETERAN_AGE && p.attributes.leadership >= MENTOR_VETERAN_LEADERSHIP);
  });
}

export function runOffseason(clubs: Club[], rng: Rng): OffseasonResult {
  let retirements = 0;
  const intakeByClub = new Map<string, number>();
  const intakePlayersByClub = new Map<string, Player[]>();
  const fireSalesByClub = new Map<string, number>();
  const retiredPlayers: RetiredLegend[] = [];
  const milestones: CareerMilestone[] = [];
  const debutEvents: DebutEvent[] = [];
  const loanReturns: LoanReturnEvent[] = [];

  // 임대 복귀: 시즌 카운트다운이 끝난 임대 선수를 원 소속 구단으로 돌려보낸다. 이번
  // 오프시즌의 성장/노화/은퇴 처리를 정상적으로 받도록, 아래 본 루프보다 먼저 처리해
  // 복귀 시점에 이미 원 소속 구단 스쿼드에 합류돼 있게 한다.
  const clubById = new Map(clubs.map((c) => [c.id, c]));
  for (const club of clubs) {
    const staying: Player[] = [];
    for (const player of club.players) {
      if (player.loanFromClubId === undefined) { staying.push(player); continue; }
      player.loanSeasonsRemaining = (player.loanSeasonsRemaining ?? 1) - 1;
      if (player.loanSeasonsRemaining > 0) { staying.push(player); continue; }
      const parent = clubById.get(player.loanFromClubId);
      if (!parent) { staying.push(player); continue; } // 원 소속 구단이 사라진 극단적 경우 현 구단에 잔류
      loanReturns.push({
        playerId: player.id, name: player.name, position: player.position,
        fromClubId: club.id, fromClubName: club.name, toClubId: parent.id, toClubName: parent.name,
      });
      player.loanFromClubId = undefined;
      player.loanSeasonsRemaining = undefined;
      player.loanWageShareByParent = undefined;
      parent.players.push(player);
      assignSquadNumber(rng, parent.players, player);
    }
    club.players = staying;
  }

  const expectedMatches = 2 * (clubs.length - 1); // 리그 기준 기대 출전
  for (const club of clubs) {
    // 스쿼드 중간 능력(주전 기대치 판단용)
    const cas = club.players.map(currentAbility).sort((a, b) => a - b);
    const medianCA = cas[Math.floor(cas.length / 2)] ?? 0;
    // 리더 특성 보유 선수가 있으면 스쿼드 전체 사기가 소폭 상승.
    const leaderBonus = club.players.some((p) => hasTrait(p, 'leader')) ? 0.05 : 0;
    // 라커룸 케미스트리: 다혈질(hothead) 2명 이상이 부딪히면 사기 수렴이 느려진다 —
    // 다만 리더가 있으면 갈등을 중재해 마찰이 무마된다.
    const hotheadCount = club.players.filter((p) => hasTrait(p, 'hothead')).length;
    const chemistryFriction = hotheadCount >= HOTHEAD_FRICTION_THRESHOLD && leaderBonus === 0;
    const moraleRetention = chemistryFriction ? FRICTION_MORALE_RETENTION : BASE_MORALE_RETENTION;

    for (const player of club.players) {
      // 출전 시간 기반 사기 갱신 (핵심 선수가 벤치면 불만)
      const ratio = Math.min(1, player.seasonApps / Math.max(1, expectedMatches));
      const key = currentAbility(player) >= medianCA;
      let target = 0.55;
      if (ratio >= 0.55) target = 0.8;
      else if (ratio < 0.25 && key) target = 0.3;
      else if (ratio < 0.25) target = 0.5;
      player.morale = clamp(moraleRetention * player.morale + (1 - moraleRetention) * (target + leaderBonus), 0, 1);

      const mentorBonus = hasMentor(club, player) ? MENTOR_GROWTH_MUL : 1;
      progressPlayer(player, rng, effectiveCoaching(player.position, club.staff), mentorBonus);
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
      player.injuryBodyPart = undefined;
      player.reinjuryRiskMatches = 0;
      player.recoveryAttrMatches = 0;
      player.yellowCards = 0;
      player.suspensionMatches = 0;
      player.seasonApps = 0;
      player.seasonGoals = 0;
    }

    // 은퇴 (스냅샷 보존 후 제거 — 통산 기록은 은퇴와 함께 사라지므로 여기서 캡처)
    club.players = club.players.filter((p) => {
      if (p.age >= RETIRE_HARD_AGE || rng.roll(retireChance(p.age, p.attributes.naturalFitness))) {
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

    // 실명 스태프 계약 잔여연수 감소(0이면 조용히 재계약)
    tickStaffContracts(club);

    // 유스 아카데미 배출
    const intake = generateAcademyIntake(
      rng, club.finance.reputation, effectiveYouth(club.staff), effectiveScouting(club.staff),
    );
    club.players.push(...intake);
    for (const p of intake) assignSquadNumber(rng, club.players, p);
    intakeByClub.set(club.id, intake.length);
    intakePlayersByClub.set(club.id, intake);

    // 은퇴·유입 후에도 골키퍼가 한 명도 없으면(극단적으로 보유 GK 전원이 같은
    // 시즌에 은퇴) 전문 GK 없이 시즌을 운영하게 되므로 응급 유스 GK로 보강한다.
    if (!club.players.some((p) => p.position === 'GK')) {
      const emergencyGk = generateYouthPlayer(rng, 'GK', club.finance.reputation);
      club.players.push(emergencyGk);
      assignSquadNumber(rng, club.players, emergencyGk);
    }

    // 스쿼드 상한 정리
    trimSquad(club);
  }
  return {
    retirements, intakeByClub, intakePlayersByClub, fireSalesByClub, retiredPlayers, milestones,
    debutEvents, loanReturns,
  };
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

  // 3) 재정 정산 (순위별) — 최근 폼(승점 비율)이 매치데이 수익에 반영된다.
  const finance = new Map<string, SeasonFinanceReport>();
  table.forEach((row, pos) => {
    const club = clubs.find((c) => c.id === row.clubId)!;
    const form = recentForm(matches, club.id, 5);
    const formRatio = form.results.length > 0 ? form.points / (form.results.length * 3) : undefined;
    finance.set(club.id, settleSeason(club, pos, clubs.length, undefined, formRatio));
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
