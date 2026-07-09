/**
 * 도메인 타입 정의.
 * engine.md 1장(능력치 36종) / 2장(포지션) 사양을 코드로 옮긴 것.
 */
import type { InjurySeverity, BodyPart } from './injury.js';
import type { PlayerInstruction } from './playerInstructions.js';
import type { SponsorContract } from './finance.js';
import type { Weather } from './weather.js';
import type { RefereeStrictness } from './referee.js';
import type { TravelBurden } from './travel.js';

// ── 능력치 키 ──────────────────────────────────────────────

export const TECHNICAL_ATTRS = [
  'finishing', 'shooting', 'passing', 'crossing', 'dribbling',
  'firstTouch', 'technique', 'tackling', 'marking', 'heading', 'setPiece',
] as const;

export const MENTAL_ATTRS = [
  'vision', 'composure', 'decisions', 'anticipation', 'offTheBall',
  'positioning', 'concentration', 'teamwork', 'workRate', 'aggression',
  'bravery', 'leadership',
] as const;

export const PHYSICAL_ATTRS = [
  'pace', 'acceleration', 'stamina', 'strength', 'agility',
  'balance', 'jumping', 'naturalFitness',
] as const;

export const GOALKEEPING_ATTRS = [
  'reflexes', 'handling', 'oneOnOne', 'aerialReach', 'goalkicks',
] as const;

export const ALL_ATTRS = [
  ...TECHNICAL_ATTRS, ...MENTAL_ATTRS, ...PHYSICAL_ATTRS, ...GOALKEEPING_ATTRS,
] as const;

export type AttrKey = (typeof ALL_ATTRS)[number];

/** 능력치 묶음. 값은 1~20 정수. */
export type Attributes = Record<AttrKey, number>;

// ── 포지션 ────────────────────────────────────────────────

export const POSITIONS = [
  'GK',
  'DL', 'DC', 'DR',
  'WBL', 'WBR',
  'DM',
  'ML', 'MC', 'MR',
  'AML', 'AMC', 'AMR',
  'ST',
] as const;

export type Position = (typeof POSITIONS)[number];

/** 라인 분류 — 팀 강도 집계에 사용. */
export type Line = 'GK' | 'DEF' | 'MID' | 'ATT';

// ── 선수 ──────────────────────────────────────────────────

/** 성과 기반 후불 이적료(Add-on) 조항의 발동 조건 종류(고도화 항목4). */
export type AddOnConditionKind = 'appearances' | 'goals' | 'assists' | 'cleanSheets';

/** Add-on 조항의 개별 지급 티어 — threshold(해당 시즌 누적치)에 도달하면 fee가
 *  1회 지급된다. 여러 티어를 조합하면 단계별 성과급이 된다(예: 10골 5천만원,
 *  20골 추가 1억원). */
export interface AddOnTier {
  kind: AddOnConditionKind;
  threshold: number;
  fee: number;
}

export interface Player {
  id: string;
  name: string;
  nationality: string;
  /** 만 나이 */
  age: number;
  /** 주 포지션 */
  position: Position;
  /** 등번호(1~99, 구단 내 유일). 구세이브 호환을 위해 선택적. */
  squadNumber?: number;
  /** 포지션별 숙련도 (0~1). 주 포지션은 1.0. */
  familiarity: Partial<Record<Position, number>>;
  attributes: Attributes;
  /** 잠재력 상한 (CA 척도, 0~200). 성장에 사용. */
  potential: number;
  /** 컨디션 (0~1). 1 = 완전. 경기 출전으로 하락, 휴식으로 회복. */
  condition: number;
  /** 사기 (0~1). 0.5 = 중립. 승패·출전시간으로 변동. */
  morale: number;
  /** 이번 시즌 선발 출전 수 (시즌 경계 리셋). */
  seasonApps: number;
  /** 남은 부상 경기 수. 0 = 정상. >0 이면 출전 불가. */
  injuryMatches: number;
  /** 현재 부상 명칭(부상 중일 때만). 회복 시 해제. */
  injuryName?: string;
  /** 부상 부위(부상 중이거나 회복 지연 중일 때 설정). 회복 지연 종료 시 해제. */
  injuryBodyPart?: BodyPart;
  /** 이번 부상의 최초 총 결장 경기 수(부상 시점에 고정, 신규 개선 항목 28) — injuryMatches(잔여)와
   *  비교해 회복 진행률을 계산하는 데 쓰인다. 회복 시 해제. 구버전 세이브는 없을 수 있어 optional. */
  injuryTotalMatches?: number;
  /** 통산 부상 발생 횟수(선수·국가대표 경기 통틀어, 고도화 항목7) — 은퇴 없이는
   *  줄어들지 않는다. 잦은 부상 이력이 시장 가치 산정에서 리스크 할인으로 반영된다.
   *  구버전 세이브는 없을 수 있어 optional(없으면 0 취급). */
  careerInjuryCount?: number;
  /** 복귀 직후 재부상 위험이 남은 경기 수. 0 = 위험 없음. */
  reinjuryRiskMatches?: number;
  /** 부상 부위 연관 능력치가 완전히 회복될 때까지 남은 경기 수. 0 = 정상. */
  recoveryAttrMatches?: number;
  /** 연속 선발 출전 경기 수(고도화 항목30) — 벤치/부상/정지로 쉬면 0으로 리셋된다.
   *  일정 수를 넘으면 로테이션 경고 대상이자 추가 피로 페널티가 붙는다. */
  consecutiveStarts?: number;
  /** 시즌 누적 경고. 일정 수마다 출전 정지. */
  yellowCards: number;
  /** 남은 출전 정지 경기 수. 0 = 정상. >0 이면 출전 불가. */
  suspensionMatches: number;
  /** 잔여 계약 연수. */
  contractYears: number;
  /** 주급 (만원). */
  wage: number;
  /** 훈련 포커스 — 성장 시 강조할 능력 그룹. */
  trainingFocus: TrainingFocus;
  /** 포지션 전환 훈련 대상(선택). 지정하면 시즌 성장 시 해당 포지션 숙련도가 코칭 지원을 받아 오른다. */
  trainingPosition?: Position;
  /** 고유 특성(0~2개). 경기·성장·부상에 영향. */
  traits: PlayerTrait[];
  /** 국가대표 A매치 출전 캡. 차출로 누적. */
  caps: number;
  /** 국가대표 은퇴 선언 여부(신규 개선 항목 19) — true면 이후 차출 대상에서 영구 제외된다.
   *  구버전 세이브는 없을 수 있어 optional(undefined는 은퇴하지 않은 것과 동일). */
  internationalRetired?: boolean;
  /** 이번 시즌 득점(리그+컵). 시즌 경계 리셋. */
  seasonGoals: number;
  /** 이번 시즌 도움(리그+컵). 시즌 경계 리셋. 구버전 세이브는 없을 수 있어
   *  optional(없으면 0 취급, 고도화 항목4: Add-on 조항 다단계화). */
  seasonAssists?: number;
  /** 이번 시즌 클린시트(무실점 경기, GK만 해당). 시즌 경계 리셋. 구버전 세이브는
   *  없을 수 있어 optional(없으면 0 취급, 고도화 항목4). */
  seasonCleanSheets?: number;
  /** 통산 선발 출전 수(전 시즌 누적). */
  careerApps: number;
  /** 통산 득점(전 시즌 누적). */
  careerGoals: number;
  /** 시즌별 CA 스냅샷(성장 곡선). 오프시즌마다 1개 추가. */
  caHistory: number[];
  /** 현 소속 구단에서 이적 없이 보낸 시즌 수(로열티, 신규 개선 항목 10) — 구단을
   *  옮기면(영입/판매/스와프/경쟁 입찰 등) 0으로 초기화되고, 오프시즌마다 1씩
   *  늘어난다. 구버전 세이브는 없을 수 있어 optional(없으면 0 취급). */
  seasonsAtClub?: number;
  /** 방출(바이아웃) 조항 금액(만원). 설정돼 있으면 협상 없이 이 금액으로 즉시 영입 가능. */
  releaseClause?: number;
  /** 임대 중이면 원 소속 구단 id — 이 선수는 지금 다른 구단(club.players 소속)에서
   *  뛰고 있지만, 임대가 끝나면 이 구단으로 돌아간다. */
  loanFromClubId?: string;
  /** 임대 복귀까지 남은 시즌 수. 오프시즌마다 1 감소하며, 0이 되면 원 소속 구단으로
   *  자동 복귀한다(loanFromClubId도 함께 해제). */
  loanSeasonsRemaining?: number;
  /** 임대 기간 중 주급을 원 소속 구단이 분담하는 비율(0~1) — 나머지는 임대 구단이 부담. */
  loanWageShareByParent?: number;
  /** 이번 시즌에 이미 임대 주급 분담률 재협상을 시도했는지(고도화 항목3, 시즌당 1회
   *  제한). 시즌이 넘어가고 임대가 계속되면 초기화된다. 구버전 세이브는 없을 수 있어
   *  optional(없으면 아직 시도 안 함 취급). */
  loanWageRenegotiatedThisSeason?: boolean;
  /** 임대 의무완전이적 조항 — 이번 임대 시즌 출전(seasonApps)이 기준에 도달하면 임대
   *  잔여 기간과 무관하게 시즌 종료 시 이 이적료로 완전 이적 전환(계약상 의무이므로
   *  자금 부족과 무관하게 강제 집행 — 이후 재정 위기 로직이 필요 시 뒷수습한다). */
  loanBuyObligation?: { appearances: number; fee: number };
  /** 임대 우선매수옵션(OTB, 신규 개선 항목 4) — 임대 구단이 임대 기간 중 언제든
   *  정해진 금액으로 완전 영입할 수 있는 "권리"(의무완전이적과 달리 강제되지 않는다).
   *  행사하지 않고 임대가 끝나면 그대로 소멸한다. */
  loanBuyOption?: { fee: number };
  /** 바이백 조항(신규 개선 항목 2) — 판매 시 원 소속 구단이 향후 정해진 금액으로
   *  되사올 수 있는 권리를 남긴다. seasonsRemaining이 0이 되면 자동 소멸. */
  buybackClause?: { clubId: string; fee: number; seasonsRemaining: number };
  /** 이번 시즌에 이미 바이백 조항 금액 재협상을 시도했는지(고도화 항목5, 시즌당 1회
   *  제한). 시즌이 넘어가고 조항이 계속 유효하면 초기화된다. 구버전 세이브는 없을 수
   *  있어 optional(없으면 아직 시도 안 함 취급). */
  buybackRenegotiatedThisSeason?: boolean;
  /** 성과 기반 후불 이적료(Add-on, 신규 개선 항목 3 → 고도화 항목4에서 다단계화) —
   *  새 구단에서 이번 시즌 성과 지표(출전/득점/도움/클린시트)가 각 티어 기준에
   *  도달할 때마다 해당 티어 몫만 원 소속 구단에 지급하고, 그 티어만 소멸한다(다른
   *  티어는 별도로 계속 유효). 모든 티어가 지급되면 조항 자체가 사라진다.
   *  paidTierIndexes는 이미 지급된 티어의 tiers 배열 인덱스(중복 지급 방지).
   *  구버전 세이브는 tiers가 없을 수 있어 그 경우 아무 티어도 발동하지 않는다. */
  addOnClause?: { sellerClubId: string; tiers: AddOnTier[]; paidTierIndexes?: number[] };
}

export type TrainingFocus =
  | 'balanced' | 'finishing' | 'playmaking' | 'defending' | 'physical' | 'goalkeeping'
  | 'conditioning';

export type PlayerTrait =
  | 'leader' | 'injuryProne' | 'ironMan' | 'wonderkid'
  | 'poacher' | 'playmaker' | 'hothead' | 'rock' | 'multiRole'
  | 'bigGameHero' | 'bigGameChoker' | 'setPieceSpecialist';

// ── 전술 ──────────────────────────────────────────────────

export interface Tactic {
  /** 포메이션 이름 (예: '4-4-2') */
  formation: string;
  /** 라인업: 슬롯 포지션 → 선수 id (개인 지시(F10)는 슬롯에 부착 — 선수 교체 시 그대로 유지된다) */
  lineup: { position: Position; playerId: string; instruction?: PlayerInstruction }[];
  /** 0(매우 수비적) ~ 1(매우 공격적). 0.5를 넘어서면 역습 실점 위험이 비선형으로 커진다. */
  mentality: number;
  /** 0(낮은 템포) ~ 1(빠른 템포). 압박과 함께 체력 소모에 영향을 준다. */
  tempo: number;
  /** 0(낮은 압박) ~ 1(강한 압박) */
  pressing: number;
  /** 0(좁게, 중앙 밀집) ~ 1(넓게, 측면 활용). 넓을수록 창출력↑·공중볼 다툼↓. */
  width: number;
  /** 0(낮은 라인) ~ 1(높은 라인). 0.5를 넘어서면 뒷공간 노출 위험이 비선형으로 커진다. */
  defensiveLine: number;
  /** 세트피스(코너·프리킥) 전담자. 지정하면 세트피스 상황의 상당수를 이 선수가 직접
   *  맡는다(라인업에 없거나 미지정이면 예전처럼 무작위). */
  setPieceTakerId?: string;
  /** 주장. 라인업에 없는 날(결장)에는 팀 전체 사기에 소폭 페널티가 붙는다. */
  captainId?: string;
  /** 부주장(고도화 항목14). 주장이 결장한 날 라인업에 있으면 완장을 대신 차
   *  팀 전체 사기 페널티가 발생하지 않는다(자동 승계). */
  viceCaptainId?: string;
}

// ── 구단 ──────────────────────────────────────────────────

/** 실명 스태프의 특기 특성 — 직책별 하나씩, 보유 시 해당 직책의 유효 레벨에 가산 보너스를 준다. */
export type StaffTrait = 'developmentGuru' | 'rehabSpecialist' | 'eyeForTalent' | 'academyMaestro';

/** 특기 특성의 등급(고도화 항목9) — 같은 특성이라도 등급에 따라 가산 보너스 크기가
 *  다르다. 초급 < 중급 < 전설급 순으로 희소하고 강력해진다. */
export type StaffTraitTier = 'novice' | 'veteran' | 'legend';

/** 스태프 능력 (1~20). 경영으로 업그레이드. */
/** 스태프 직책에 배정된 실명 인물(이름·나이·계약기간·특기 특성). 구버전 세이브·미도입
 *  구단은 Staff.members 자체가 없을 수 있어 항상 optional로 다룬다. */
export interface StaffMember {
  name: string;
  age: number;
  /** 잔여 계약 연수. 0이 되면 시즌 경계에 조용히 재계약된다(교체 드라마는 후속 확장 몫). */
  contractYears: number;
  /** 특기 특성(있을 수도, 없을 수도). 스태프 업그레이드로 새 인물을 영입할 때만 새로 판정되고,
   *  같은 인물의 단순 재계약(계약 만료 시 잔류)으로는 바뀌지 않는다. */
  trait?: StaffTrait;
  /** 특기 특성의 등급(고도화 항목9) — trait가 있을 때만 의미가 있다. 구버전 세이브는
   *  없을 수 있어 optional(없으면 veteran 취급 — 기존 STAFF_TRAIT_BONUS와 동일한
   *  중간 등급으로 하위 호환). */
  traitTier?: StaffTraitTier;
}

export interface Staff {
  /** 코칭: 선수 성장률↑. */
  coaching: number;
  /** 의료: 부상 확률·기간↓, 컨디션 회복↑. */
  medical: number;
  /** 스카우팅: 이적 매물 잠재력 정보 정확도↑. */
  scouting: number;
  /** 유스: 아카데미 유망주 배출 수·잠재력↑. */
  youth: number;
  /** 세부 코치 레벨(GK/공격/수비/피지컬) — 구버전 세이브·미도입 구단은 undefined이며,
   *  이 경우 성장 계산 시 기존 coaching 레벨을 그대로 대체값으로 사용한다(하위 호환). */
  coachGk?: number;
  coachAttack?: number;
  coachDefense?: number;
  coachPhysical?: number;
  /** 리저브(2군) 전담 코치 레벨 — 구버전 세이브·미도입 구단은 undefined이며,
   *  이 경우 리저브 성장 계산 시 기존 coaching(세부 코치 블렌드) 레벨을 그대로 대체값으로
   *  사용한다(하위 호환). 도입 시 리저브 성장에서 총괄/세부 코치보다 훨씬 크게 반영된다. */
  reserveCoach?: number;
  /** 각 스태프 직책의 실명 인물 정보(선택 — coaching/medical/scouting/youth만 대상). */
  members?: Partial<Record<'coaching' | 'medical' | 'scouting' | 'youth', StaffMember>>;
}

/** 구단 재정 상태 (economy.md 4장). 단위: 만원. */
export interface ClubFinance {
  /** 보유 자금. */
  balance: number;
  /** 이적 가능 예산. */
  transferBudget: number;
  /** 평판 (1~20). 수입 규모에 영향. */
  reputation: number;
  /** 스타디움 증축 단계(0~STADIUM_MAX) — 매치데이 수익 상한을 다시즌에 걸쳐 회수하는
   *  구조로 높인다(C8). 구버전 세이브는 없을 수 있어 optional(없으면 0 = 기본 규모). */
  stadiumLevel?: number;
  /** 아카데미 시설 등급(0~ACADEMY_MAX) — 유스 스태프(인력)와 별개로 훈련장·시설
   *  자체에 투자하는 자본재. 유스 인테이크 잠재력에 가산 보너스로 반영된다(B11).
   *  구버전 세이브는 없을 수 있어 optional(없으면 0 = 기본 시설). */
  academyLevel?: number;
  /** 유스 아카데미 포지션 특화 라인(신규 개선 항목 13) — 지정하면 이후 유스 인테이크가
   *  이 라인 포지션을 더 자주 배출하고, 그 라인 유망주는 잠재력도 추가로 오른다(대신
   *  다른 라인은 상대적으로 덜 나온다). 지정하지 않으면(undefined) 기존과 동일하게
   *  라인 편향 없이 균등하게 배출된다. */
  academyFocus?: Line;
  /** 훈련장(피지컬 트레이닝) 시설 등급(0~TRAINING_GROUND_MAX, 신규 개선 항목 21) — 의료
   *  스태프(인력)와 별개로 훈련 인프라 자체에 투자하는 자본재. 전 선수의 경기당 부상
   *  발생 확률을 추가로 낮춘다. 구버전 세이브는 없을 수 있어 optional(없으면 0 = 기본 시설). */
  trainingGroundLevel?: number;
  /** 체결한 스폰서 계약(유니폼/스타디움 명명권, 신규 개선 항목 24) — 성과와 무관하게
   *  매 시즌 고정 수익을 지급하는 장기 계약. 구버전 세이브는 없을 수 있어 optional. */
  sponsorContracts?: SponsorContract[];
  /** 티켓 가격 등급(고도화 항목18) — 비쌀수록 매치데이 수익은 늘지만 팬 만족도는 깎인다.
   *  구버전 세이브는 없을 수 있어 optional(없으면 'normal' = 기존과 동일한 수익). */
  ticketPriceTier?: TicketPriceTier;
  /** 팬 만족도(0~100, 고도화 항목18) — 성적·티켓가·영입 소식에 반응한다. 구버전 세이브는
   *  없을 수 있어 optional(없으면 FAN_SATISFACTION_DEFAULT로 취급). */
  fanSatisfaction?: number;
  /** 팬 만족도가 문턱 미만으로 떨어져 시위가 발생한 상태(고도화 항목18) — 다음 시즌
   *  정산에서 매치데이 수익 페널티가 한 번 적용된 뒤 자동으로 꺼진다. */
  fanProtestActive?: boolean;
  /** 연속 재정 위기(자금 음수) 시즌 수(고도화 항목21) — 파이낸셜 페어플레이 단계적
   *  절차(경고→제재→강제매각)에 쓰인다. 흑자로 돌아서면 0으로 리셋된다. */
  financialCrisisStreak?: number;
}

/** 티켓 가격 등급(고도화 항목18) — finance.ts의 매치데이 수익 배율·팬 만족도 계산에 쓰인다. */
export type TicketPriceTier = 'low' | 'normal' | 'high';

/** 이사회의 인내심 성향 — 목표 미달 시 얼마나 가혹하게 반응하는가(board.ts). */
export type BoardPatience = 'patient' | 'impatient';
/** 이사회의 재정 성향 — 시즌 순수익 여부·특별 요구 빈도에 얼마나 민감한가(board.ts/demands.ts). */
export type BoardStyle = 'conservative' | 'aggressive';

export interface BoardPersona {
  patience: BoardPatience;
  style: BoardStyle;
}

export interface Club {
  id: string;
  name: string;
  players: Player[];
  /** 재정. 생성 시 부여. */
  finance: ClubFinance;
  /** 스태프. 생성 시 부여. */
  staff: Staff;
  /** 소속 부 (0 = 1부, 1 = 2부). 승강으로 변동. */
  division: number;
  /** 이사회 성향(인내심·재정 스타일). 구버전 세이브는 없을 수 있어 optional. */
  boardPersona?: BoardPersona;
  /** 리저브(2군) 스쿼드 — 유스 인테이크가 1군에 바로 합류하는 대신 여기서 성장하다가
   *  준비되면 승격된다(B9). 구버전 세이브는 없을 수 있어 optional(없으면 빈 배열 취급). */
  reserves?: Player[];
  /** 파견 정찰을 마쳐 PA를 영구적으로 정확히 알고 있는 선수 id 목록(B13). 구버전
   *  세이브는 없을 수 있어 optional(없으면 파견한 선수 없음 취급). */
  scoutedPlayerIds?: string[];
  /** 유저가 직접 지정한 멘토-멘티 쌍(B14) — 같은 라인 자동 멘토링보다 강한 성장
   *  보너스를 준다(상한 인원 제한). 구버전 세이브는 없을 수 있어 optional. */
  mentorPairings?: MentorPairing[];
  /** 에이전트 관계 지수(0~100)를 상대 구단(협상 상대 선수의 소속 구단)별로 관리한다
   *  (고도화 항목1 — 신규 개선 항목 6을 세분화). 특정 구단과 순조롭게 거래할수록 그
   *  구단과의 다음 협상만 유리해지고, 결렬되면 그 구단과의 관계만 크게 깎인다 — 한
   *  구단과 잘 지낸다고 다른 모든 구단과의 관계가 좋아지지 않는다. 거래가 없는 채로
   *  시즌이 지나면 서서히 중립으로 회귀한다. 구버전 세이브는 없을 수 있어
   *  optional(없으면 상대 구단마다 AGENT_RELATIONS_DEFAULT = 중립 취급). */
  agentRelationsByClub?: Record<string, number>;
}

/** 유저가 직접 지정한 멘토-멘티 쌍(B14). */
export interface MentorPairing {
  mentorId: string;
  menteeId: string;
}

// ── 경기 입력/출력 ────────────────────────────────────────

export interface TeamStrength {
  attack: number;
  creation: number;
  midfield: number;
  defense: number;
  physical: number;
  aerial: number;
  gk: number;
}

export type ChanceType = 'open' | 'cross' | 'setpiece';
export type ShotOutcome = 'GOAL' | 'SAVE' | 'OFF_TARGET' | 'BLOCKED' | 'OWN_GOAL';

export interface MatchEvent {
  minute: number;
  side: 'home' | 'away';
  chanceType: ChanceType;
  outcome: ShotOutcome;
  playerId: string;
  playerName: string;
  /** 득점(outcome==='GOAL')에 어시스트가 붙었을 때만 설정. */
  assistPlayerId?: string;
  assistPlayerName?: string;
  /** 자책골(고도화 항목42) — true면 playerId/playerName은 수비 측(실점 귀책) 선수를
   *  가리키고, side는 여전히 득점이 반영되는(득점을 얻는) 공격 측이다. */
  isOwnGoal?: boolean;
}

export type CardType = 'yellow' | 'red';

export interface CardEvent {
  minute: number;
  side: 'home' | 'away';
  playerId: string;
  playerName: string;
  type: CardType;
}

export interface PlayerMatchStat {
  playerId: string;
  name: string;
  /** 이 경기를 뛴 주 포지션(시즌 집계에서 베스트 XI 등 포지션별 분류에 사용). */
  position: Position;
  rating: number;
  shots: number;
  goals: number;
  assists: number;
  /** GK 슬롯으로 뛴 선수가 무실점으로 경기를 마쳤는지(골든글러브 집계용). GK가 아니면 미설정. */
  cleanSheet?: boolean;
  /** 이 경기에서 범한 자책골 수(고도화 항목42). 없으면 0으로 취급. */
  ownGoals?: number;
  /** 빅찬스(득점확률이 임계값 이상인 슈팅) 생성 수(고도화 항목45). 없으면 0으로 취급. */
  bigChancesCreated?: number;
  /** 빅찬스 중 득점으로 이어지지 않은 수(고도화 항목45). 없으면 0으로 취급. */
  bigChancesMissed?: number;
}

export interface InjuryEvent {
  minute: number;
  side: 'home' | 'away';
  playerId: string;
  playerName: string;
  severity: InjurySeverity;
  /** 부위/부상 명칭. */
  name: string;
  bodyPart: BodyPart;
  /** 결장 경기 수. */
  matches: number;
}

export interface MatchResult {
  homeClubId: string;
  awayClubId: string;
  homeClubName: string;
  awayClubName: string;
  score: [number, number];
  possession: [number, number];
  shots: [number, number];
  events: MatchEvent[];
  cards: CardEvent[];
  /** 경기 중 부상 판정(전술 라인업 기준, 시드 고정 → 재현 가능). 관전 중 실시간 노출용. */
  injuries: InjuryEvent[];
  playerStats: { home: PlayerMatchStat[]; away: PlayerMatchStat[] };
  seed: number;
  /** 양 팀 통틀어 평점(동률이면 득점)이 가장 높은 선수 — 맨오브더매치. 출전자가 없으면 미설정. */
  motmPlayerId?: string;
  /** 경기 날씨(신규 개선 항목 26). 손으로 만든 MatchResult(테스트 등)엔 없을 수 있어 optional. */
  weather?: Weather;
  /** 이 경기 심판의 엄격도(고도화 항목46). 손으로 만든 MatchResult(테스트 등)엔 없을 수
   *  있어 optional. */
  refereeStrictness?: RefereeStrictness;
  /** 원정팀의 이동 부담(고도화 항목48). 손으로 만든 MatchResult(테스트 등)엔 없을 수
   *  있어 optional. */
  awayTravelBurden?: TravelBurden;
}
