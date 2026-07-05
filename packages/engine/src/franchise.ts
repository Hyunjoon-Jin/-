/**
 * 멀티시즌 프랜차이즈 루프 (design.md 5장: 시즌 루프).
 * 한 시즌 = 이적 창 → 리그 경기 → 재정 정산 → 선수 성장/노화 → 은퇴·유스 유입.
 * 게임의 시간축을 닫는 핵심 루프.
 */
import type { Club, Player, Position } from './types.js';
import type { BoardStatus } from './board.js';
import { POSITIONS } from './types.js';
import { simulateSeason, type TableRow } from './league.js';
import { settleSeason, type SeasonFinanceReport } from './finance.js';
import { runTransferWindow, type TransferDeal } from './transfer.js';
import { progressPlayer } from './progression.js';
import { generateAcademyIntake, generateYouthPlayer, assignSquadNumber } from './generate.js';
import { applyLoanWageSubsidies, MIN_SQUAD } from './transferActions.js';
import { enforceFinancialFairPlay } from './financeControl.js';
import { runInternationalBreak, runInternationalTournament, TOURNAMENT_INTERVAL_SEASONS } from './international.js';
import { currentAbility } from './derived.js';
import { hasTrait } from './traits.js';
import { lineOf } from './teamStrength.js';
import {
  effectiveCoaching, effectiveYouth, effectiveScouting, effectiveReserveCoaching,
  tickStaffContracts, type StaffDepartureEvent,
} from './staffActions.js';
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
  /** 이번 오프시즌 내 구단 관련 의무완전이적 조항 발동(A1). */
  loanObligations?: LoanObligationEvent[];
  /** 이번 오프시즌 리저브에서 1군으로 승격한 선수(내 구단, B9). */
  reservePromotions?: ReservePromotionEvent[];
  /** 이번 오프시즌 계약 만료로 타 구단에 스카우트되어 이탈한 내 구단 실명 스태프(신규 영입 후임 포함). */
  staffDepartures?: StaffDepartureEvent[];
  /** 이번 시즌 비정기 국제대회(월드컵/유로급, C15)가 열렸다면 우승 국가. 참가 자격국 부족 시 null.
   *  값이 undefined면 이번 시즌엔 대회가 열리지 않고 정기 A매치 차출만 있었다는 뜻. */
  internationalTournamentChampion?: string | null;
  /** 대륙컵 우승 구단(D17, 병행 대회 — 1부 상위 성적 구단만 참가). 앱 전용, 헤드리스엔 미설정. */
  continentalCupChampionId?: string;
  continentalCupChampionName?: string;
  /** 이번 시즌 성적으로 다음 시즌 대륙컵 진출권을 획득했는지(내 구단 기준, 앱). */
  qualifiedForContinental?: boolean;
  /** 이사회 신뢰 등급이 이번 시즌 실제로 올라 지급된 일회성 투자 예산 승인(내 구단, 앱). */
  boardTierBonus?: { fromStatus: BoardStatus; toStatus: BoardStatus; amount: number };
  /** 이번 시즌 내 구단이 관련된 성과 기반 후불 이적료(Add-on) 발동(신규 개선 항목 3). */
  addOnPayouts?: AddOnEvent[];
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

/** 리저브 승격 가능 최소 나이 — 이보다 어리면 아직 후보군일 뿐 승격하지 않는다. */
const RESERVE_PROMOTION_MIN_AGE = 17;
/** 이 나이까지 승격하지 못하면 잠재력과 무관하게 결론(승격 또는 방출)을 낸다. */
const RESERVE_RESOLUTION_AGE = 21;
/** 승격 판단 기준 — 현재 능력이 잠재력의 이 비율 이상이면 "1군에서 통할 준비가 됐다"고 본다. */
const RESERVE_READY_RATIO = 0.35;
/** 1군 인원이 이 아래로 떨어지면 준비도와 무관하게 리저브에서 끌어올려 채운다(붕괴 방지). */
const SQUAD_CRITICAL_SIZE = 18;

interface ReserveProgressResult {
  promoted: Player[];
  released: number;
}

/**
 * 리저브(2군) 스쿼드의 오프시즌 성장(나이·능력치 진행)과 승격/방출 판정(B9).
 * 1군과 달리 실전 출전이 없어 사기 수렴 로직은 적용하지 않는다.
 * @param firstTeamSize 판정 시점의 1군 인원 — 위급하게 적으면 준비도 기준을 무시하고 끌어올린다.
 */
function progressReserves(club: Club, rng: Rng, firstTeamSize: number): ReserveProgressResult {
  const reserves = club.reserves ?? [];
  const promoted: Player[] = [];
  const staying: Player[] = [];
  let released = 0;

  for (const p of reserves) {
    progressPlayer(p, rng, effectiveReserveCoaching(p.position, club.staff));
    const hist = p.caHistory ?? (p.caHistory = []);
    hist.push(Math.round(currentAbility(p)));
    if (hist.length > 20) hist.shift();

    const ready = currentAbility(p) >= p.potential * RESERVE_READY_RATIO;
    const squadCritical = firstTeamSize + promoted.length < SQUAD_CRITICAL_SIZE;
    if (p.age >= RESERVE_RESOLUTION_AGE) {
      // 이 나이까지 왔으면 리저브에 더 둘 수 없다 — 준비됐으면 승격, 아니면 방출.
      if (ready) promoted.push(p); else released++;
    } else if (p.age >= RESERVE_PROMOTION_MIN_AGE && (ready || squadCritical)) {
      promoted.push(p);
    } else {
      staying.push(p);
    }
  }

  club.reserves = staying;
  return { promoted, released };
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

/** 리저브(2군) 승격 이벤트(B9) — 오프시즌에 리저브에서 1군으로 승격한 선수. */
export interface ReservePromotionEvent {
  playerId: string;
  name: string;
  position: Position;
  clubId: string;
  clubName: string;
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

/** 임대 의무완전이적 조항 발동 이벤트(A1) — 출전 기준을 채워 완전 이적으로 전환. */
export interface LoanObligationEvent {
  playerId: string;
  name: string;
  position: Position;
  /** 원 소속(선수를 팔게 되는 쪽). */
  fromClubId: string;
  fromClubName: string;
  /** 임대 갔던 구단(이제 완전 영입하는 쪽). */
  toClubId: string;
  toClubName: string;
  fee: number;
}

/** 성과 기반 후불 이적료(Add-on) 발동 이벤트(신규 개선 항목 3). */
export interface AddOnEvent {
  playerId: string;
  name: string;
  position: Position;
  /** 지금 이 선수가 뛰고 있는 구단(이적료를 지불하는 쪽). */
  fromClubId: string;
  fromClubName: string;
  /** 원 소속(이적료를 받는 쪽). */
  toClubId: string;
  toClubName: string;
  fee: number;
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
  /** 이번 오프시즌에 의무완전이적 조항이 발동해 완전 이적으로 전환된 선수(전 구단, A1). */
  loanObligations: LoanObligationEvent[];
  /** 이번 오프시즌 리저브에서 1군으로 승격한 선수(전 구단, B9). */
  reservePromotions: ReservePromotionEvent[];
  /** clubId → 리저브에서 방출된 인원(1군 승격 기준 미달 상태로 결론 나이에 도달, B9). */
  reserveReleasesByClub: Map<string, number>;
  /** 이번 오프시즌 계약 만료로 타 구단에 스카우트되어 이탈한 실명 스태프(전 구단, clubId 포함). */
  staffDepartures: (StaffDepartureEvent & { clubId: string; clubName: string })[];
  /** 이번 오프시즌 성과 기반 후불 이적료(Add-on)가 발동한 선수(전 구단, 신규 개선 항목 3). */
  addOnPayouts: AddOnEvent[];
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

/** 유저 지정 멘토 페어링(B14) 최대 동시 개수 — 유한한 자원으로 만들어 실제 선택이 되게 한다. */
export const MENTOR_PAIRING_MAX = 3;
/** 직접 지정한 멘토링은 자동(같은 라인) 멘토링보다 더 큰 성장 보너스를 준다. */
const DESIGNATED_MENTOR_GROWTH_MUL = 1.25;

export interface MentorAssignResult { ok: boolean; reason?: string }

/** 유저가 직접 멘토-멘티를 지정한다. 멘토는 멘티보다 나이가 많아야 하고, 멘티는
 *  아직 성장 중(23세 이하)이어야 한다. 이미 그 멘티에게 지정된 멘토가 있으면
 *  교체로 취급해(상한 소모 없이) 갱신한다. */
export function assignMentor(club: Club, mentorId: string, menteeId: string): MentorAssignResult {
  if (mentorId === menteeId) return { ok: false, reason: '같은 선수를 멘토와 멘티로 지정할 수 없습니다.' };
  const mentor = club.players.find((p) => p.id === mentorId);
  const mentee = club.players.find((p) => p.id === menteeId);
  if (!mentor || !mentee) return { ok: false, reason: '선수를 찾을 수 없습니다.' };
  if (mentee.age > MENTEE_MAX_AGE) return { ok: false, reason: `멘티는 ${MENTEE_MAX_AGE}세 이하 유망주만 가능합니다.` };
  if (mentor.age <= mentee.age) return { ok: false, reason: '멘토는 멘티보다 나이가 많아야 합니다.' };
  const pairings = club.mentorPairings ?? (club.mentorPairings = []);
  const existingForMentee = pairings.find((m) => m.menteeId === menteeId);
  if (existingForMentee) { existingForMentee.mentorId = mentorId; return { ok: true }; }
  if (pairings.length >= MENTOR_PAIRING_MAX) {
    return { ok: false, reason: `동시에 최대 ${MENTOR_PAIRING_MAX}쌍까지만 지정할 수 있습니다.` };
  }
  pairings.push({ mentorId, menteeId });
  return { ok: true };
}

/** 지정된 멘토 페어링을 해제한다(멘티 기준). */
export function clearMentorPairing(club: Club, menteeId: string): void {
  if (!club.mentorPairings) return;
  club.mentorPairings = club.mentorPairings.filter((m) => m.menteeId !== menteeId);
}

/** 멘티에게 유저 지정 멘토가 배정돼 있고 그 멘토가 여전히 스쿼드에 있으면 강화된
 *  성장 배율을, 아니면 1을 반환한다(자동 멘토링과 별개 — 더 큰 쪽을 적용). */
function designatedMentorBonus(club: Club, player: Player): number {
  const pairing = club.mentorPairings?.find((m) => m.menteeId === player.id);
  if (!pairing) return 1;
  const mentorStillHere = club.players.some((p) => p.id === pairing.mentorId);
  return mentorStillHere ? DESIGNATED_MENTOR_GROWTH_MUL : 1;
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
  const loanObligations: LoanObligationEvent[] = [];
  const reservePromotions: ReservePromotionEvent[] = [];
  const reserveReleasesByClub = new Map<string, number>();
  const staffDepartures: (StaffDepartureEvent & { clubId: string; clubName: string })[] = [];
  const addOnPayouts: AddOnEvent[] = [];

  // 임대 복귀: 시즌 카운트다운이 끝난 임대 선수를 원 소속 구단으로 돌려보낸다. 이번
  // 오프시즌의 성장/노화/은퇴 처리를 정상적으로 받도록, 아래 본 루프보다 먼저 처리해
  // 복귀 시점에 이미 원 소속 구단 스쿼드에 합류돼 있게 한다.
  const clubById = new Map(clubs.map((c) => [c.id, c]));
  for (const club of clubs) {
    const staying: Player[] = [];
    for (const player of club.players) {
      if (player.loanFromClubId === undefined) { staying.push(player); continue; }
      const parent = clubById.get(player.loanFromClubId);

      // 의무완전이적 조항(A1) — 이번 시즌 출전이 기준에 도달하면 잔여 임대 기간과
      // 무관하게 계약상 의무로 완전 이적이 확정된다(자금 부족이어도 강제 집행 —
      // 재정 위기로 이어지면 같은 오프시즌 뒤에 도는 enforceFinancialFairPlay가 즉시 뒷수습한다).
      if (parent && player.loanBuyObligation && player.seasonApps >= player.loanBuyObligation.appearances) {
        const fee = player.loanBuyObligation.fee;
        club.finance.balance -= fee;
        parent.finance.balance += fee;
        loanObligations.push({
          playerId: player.id, name: player.name, position: player.position,
          fromClubId: parent.id, fromClubName: parent.name, toClubId: club.id, toClubName: club.name, fee,
        });
        player.loanFromClubId = undefined;
        player.loanSeasonsRemaining = undefined;
        player.loanWageShareByParent = undefined;
        player.loanBuyObligation = undefined;
        player.loanBuyOption = undefined;
        staying.push(player); // 완전 이적이라 현 구단(임대 갔던 구단)에 그대로 남는다.
        continue;
      }

      player.loanSeasonsRemaining = (player.loanSeasonsRemaining ?? 1) - 1;
      if (player.loanSeasonsRemaining > 0) { staying.push(player); continue; }
      if (!parent) { staying.push(player); continue; } // 원 소속 구단이 사라진 극단적 경우 현 구단에 잔류
      loanReturns.push({
        playerId: player.id, name: player.name, position: player.position,
        fromClubId: club.id, fromClubName: club.name, toClubId: parent.id, toClubName: parent.name,
      });
      player.loanFromClubId = undefined;
      player.loanSeasonsRemaining = undefined;
      player.loanWageShareByParent = undefined;
      player.loanBuyOption = undefined;
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

      // 바이백 조항(신규 개선 항목 2) 유효기간 카운트다운 — 0이 되면 자동 소멸.
      if (player.buybackClause) {
        player.buybackClause.seasonsRemaining -= 1;
        if (player.buybackClause.seasonsRemaining <= 0) player.buybackClause = undefined;
      }

      const mentorBonus = Math.max(
        hasMentor(club, player) ? MENTOR_GROWTH_MUL : 1,
        designatedMentorBonus(club, player),
      );
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
      // 성과 기반 후불 이적료(Add-on, 신규 개선 항목 3) — 이번 시즌 출전·득점 중 지정된
      // 조건에 하나라도 도달하면 원 소속 구단에 즉시 지급하고 조항을 소멸시킨다.
      if (player.addOnClause) {
        const clause = player.addOnClause;
        const appsHit = clause.appearances !== undefined && player.seasonApps >= clause.appearances;
        const goalsHit = clause.goals !== undefined && (player.seasonGoals ?? 0) >= clause.goals;
        if (appsHit || goalsHit) {
          const seller = clubById.get(clause.sellerClubId);
          if (seller) {
            club.finance.balance -= clause.fee;
            seller.finance.balance += clause.fee;
            seller.finance.transferBudget += clause.fee;
            addOnPayouts.push({
              playerId: player.id, name: player.name, position: player.position,
              fromClubId: club.id, fromClubName: club.name, toClubId: seller.id, toClubName: seller.name,
              fee: clause.fee,
            });
          }
          player.addOnClause = undefined;
        }
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

    // 실명 스태프 계약 잔여연수 감소(0이면 확률적으로 이탈·후임 영입, 그 외엔 조용히 재계약)
    const departures = tickStaffContracts(club, rng);
    for (const d of departures) staffDepartures.push({ ...d, clubId: club.id, clubName: club.name });

    // 리저브 성장 + 승격/방출 판정 — 승격 인원은 1군에 합류(스쿼드 상한 초과분은 이후
    // trimSquad가 정리). 이번 시즌 새로 들어올 유스 인테이크보다 먼저 처리해, 갓
    // 배출된 신인이 배출된 바로 그 시즌에 곧장 승격 판정을 받지 않고 최소 한 시즌은
    // 리저브를 실제로 거치게 한다.
    const { promoted, released } = progressReserves(club, rng, club.players.length);
    for (const p of promoted) {
      club.players.push(p);
      assignSquadNumber(rng, club.players, p);
      reservePromotions.push({ playerId: p.id, name: p.name, position: p.position, clubId: club.id, clubName: club.name });
    }
    reserveReleasesByClub.set(club.id, released);

    // 유스 아카데미 배출 — 1군이 아닌 리저브로 합류(B9), 승격 전까지는 출전 대상이 아니다.
    const intake = generateAcademyIntake(
      rng, club.finance.reputation, effectiveYouth(club.staff), effectiveScouting(club.staff),
      club.finance.academyLevel ?? 0,
    );
    const reserves = club.reserves ?? (club.reserves = []);
    reserves.push(...intake);
    for (const p of intake) assignSquadNumber(rng, reserves, p);
    intakeByClub.set(club.id, intake.length);
    intakePlayersByClub.set(club.id, intake);

    // 은퇴·유입 후에도 골키퍼가 한 명도 없으면(극단적으로 보유 GK 전원이 같은
    // 시즌에 은퇴) 전문 GK 없이 시즌을 운영하게 되므로 응급 유스 GK로 보강한다.
    if (!club.players.some((p) => p.position === 'GK')) {
      const emergencyGk = generateYouthPlayer(rng, 'GK', club.finance.reputation);
      club.players.push(emergencyGk);
      assignSquadNumber(rng, club.players, emergencyGk);
    }

    // 은퇴·임대·스태프 이탈 등이 겹쳐 스쿼드가 최소 인원 아래로 내려가면(극단적 불운)
    // 시뮬레이션 무결성을 위해 응급 유스로 보강한다.
    while (club.players.length < MIN_SQUAD) {
      const position = POSITIONS[rng.int(0, POSITIONS.length - 1)]!;
      const emergency = generateYouthPlayer(rng, position, club.finance.reputation);
      club.players.push(emergency);
      assignSquadNumber(rng, club.players, emergency);
    }

    // 스쿼드 상한 정리
    trimSquad(club);

    // 멘토·멘티 중 한쪽이라도 스쿼드를 떠났으면(은퇴·매각·이적 등) 페어링을 정리한다
    // (세이브 파일에 죽은 페어링이 계속 쌓이는 것을 방지 — 성장 계산은 어차피
    // designatedMentorBonus에서 매번 재검증하므로 정합성에는 영향 없음).
    if (club.mentorPairings) {
      const ids = new Set(club.players.map((p) => p.id));
      club.mentorPairings = club.mentorPairings.filter((m) => ids.has(m.mentorId) && ids.has(m.menteeId));
    }
  }
  return {
    retirements, intakeByClub, intakePlayersByClub, fireSalesByClub, retiredPlayers, milestones,
    debutEvents, loanReturns, loanObligations, reservePromotions, reserveReleasesByClub, staffDepartures,
    addOnPayouts,
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
  // TOURNAMENT_INTERVAL_SEASONS마다는 정기 차출 대신 비정기 국제대회(월드컵/유로급)로 확장.
  if (season % TOURNAMENT_INTERVAL_SEASONS === 0) {
    runInternationalTournament(clubs, rng);
  } else {
    runInternationalBreak(clubs, rng);
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
