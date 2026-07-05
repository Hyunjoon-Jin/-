/**
 * 도메인 타입 정의.
 * engine.md 1장(능력치 36종) / 2장(포지션) 사양을 코드로 옮긴 것.
 */
import type { InjurySeverity, BodyPart } from './injury.js';
import type { PlayerInstruction } from './playerInstructions.js';

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
  /** 복귀 직후 재부상 위험이 남은 경기 수. 0 = 위험 없음. */
  reinjuryRiskMatches?: number;
  /** 부상 부위 연관 능력치가 완전히 회복될 때까지 남은 경기 수. 0 = 정상. */
  recoveryAttrMatches?: number;
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
  /** 이번 시즌 득점(리그+컵). 시즌 경계 리셋. */
  seasonGoals: number;
  /** 통산 선발 출전 수(전 시즌 누적). */
  careerApps: number;
  /** 통산 득점(전 시즌 누적). */
  careerGoals: number;
  /** 시즌별 CA 스냅샷(성장 곡선). 오프시즌마다 1개 추가. */
  caHistory: number[];
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
  /** 임대 의무완전이적 조항 — 이번 임대 시즌 출전(seasonApps)이 기준에 도달하면 임대
   *  잔여 기간과 무관하게 시즌 종료 시 이 이적료로 완전 이적 전환(계약상 의무이므로
   *  자금 부족과 무관하게 강제 집행 — 이후 재정 위기 로직이 필요 시 뒷수습한다). */
  loanBuyObligation?: { appearances: number; fee: number };
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
}

// ── 구단 ──────────────────────────────────────────────────

/** 실명 스태프의 특기 특성 — 직책별 하나씩, 보유 시 해당 직책의 유효 레벨에 가산 보너스를 준다. */
export type StaffTrait = 'developmentGuru' | 'rehabSpecialist' | 'eyeForTalent' | 'academyMaestro';

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
}

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
export type ShotOutcome = 'GOAL' | 'SAVE' | 'OFF_TARGET' | 'BLOCKED';

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
}
