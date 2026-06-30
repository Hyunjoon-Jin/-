/**
 * 파생 능력치 가중치 (engine.md 1.3).
 * "포지션마다 중요한 능력치가 다르다"를 데이터로 표현한다.
 * 밸런싱 시 이 표만 조정하면 된다.
 */
import type { AttrKey } from './types.js';

export type DerivedKey =
  | 'attack'      // 마무리·득점 능력
  | 'creation'    // 기회 창출
  | 'midfield'    // 중원 장악·빌드업
  | 'defense'     // 수비
  | 'physical'    // 신체
  | 'aerial'      // 공중 경합
  | 'gk';         // 골키핑

export type Weights = Partial<Record<AttrKey, number>>;

export const DERIVED_WEIGHTS: Record<DerivedKey, Weights> = {
  attack: {
    finishing: 4, shooting: 2, composure: 2, offTheBall: 2,
    technique: 1, firstTouch: 1, anticipation: 1, decisions: 1,
  },
  creation: {
    vision: 3, passing: 3, dribbling: 2, crossing: 2,
    decisions: 2, technique: 1, firstTouch: 1, offTheBall: 1,
  },
  midfield: {
    passing: 3, decisions: 2, vision: 2, workRate: 2, teamwork: 2,
    stamina: 1, firstTouch: 1, composure: 1,
  },
  defense: {
    tackling: 3, marking: 3, positioning: 3, anticipation: 2,
    concentration: 2, strength: 1, decisions: 1, aggression: 1,
  },
  physical: {
    pace: 3, acceleration: 2, strength: 2, stamina: 2,
    agility: 1, balance: 1,
  },
  aerial: {
    heading: 3, jumping: 3, strength: 2, bravery: 1,
  },
  gk: {
    reflexes: 4, handling: 3, oneOnOne: 2, positioning: 2,
    concentration: 1, aerialReach: 1, goalkicks: 1,
  },
};
