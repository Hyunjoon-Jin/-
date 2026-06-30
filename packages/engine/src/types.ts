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
  /** 컨디션 (0~1). 1 = 완전. 피로/부상 반영. */
  condition: number;
  /** 사기 (0~1). 0.5 = 중립. */
  morale: number;
}

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

export interface Club {
  id: string;
  name: string;
  players: Player[];
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
  playerStats: { home: PlayerMatchStat[]; away: PlayerMatchStat[] };
  seed: number;
}
