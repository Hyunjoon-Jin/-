/**
 * 도메인 타입 정의.
 * engine.md 1장(능력치 36종) / 2장(포지션) 사양을 코드로 옮긴 것.
 */

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
}

export type TrainingFocus =
  | 'balanced' | 'finishing' | 'playmaking' | 'defending' | 'physical' | 'goalkeeping';

// ── 전술 ──────────────────────────────────────────────────

export interface Tactic {
  /** 포메이션 이름 (예: '4-4-2') */
  formation: string;
  /** 라인업: 슬롯 포지션 → 선수 id */
  lineup: { position: Position; playerId: string }[];
  /** 0(매우 수비적) ~ 1(매우 공격적) */
  mentality: number;
  /** 0(낮은 템포) ~ 1(빠른 템포) */
  tempo: number;
  /** 0(낮은 압박) ~ 1(강한 압박) */
  pressing: number;
}

// ── 구단 ──────────────────────────────────────────────────

/** 스태프 능력 (1~20). 경영으로 업그레이드. */
export interface Staff {
  /** 코칭: 선수 성장률↑. */
  coaching: number;
  /** 의료: 부상 확률·기간↓, 컨디션 회복↑. */
  medical: number;
  /** 스카우팅: 이적 매물 잠재력 정보 정확도↑. */
  scouting: number;
  /** 유스: 아카데미 유망주 배출 수·잠재력↑. */
  youth: number;
}

/** 구단 재정 상태 (economy.md 4장). 단위: 만원. */
export interface ClubFinance {
  /** 보유 자금. */
  balance: number;
  /** 이적 가능 예산. */
  transferBudget: number;
  /** 평판 (1~20). 수입 규모에 영향. */
  reputation: number;
}

export interface Club {
  id: string;
  name: string;
  players: Player[];
  /** 재정. 생성 시 부여. */
  finance: ClubFinance;
  /** 스태프. 생성 시 부여. */
  staff: Staff;
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
  rating: number;
  shots: number;
  goals: number;
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
  playerStats: { home: PlayerMatchStat[]; away: PlayerMatchStat[] };
  seed: number;
}
