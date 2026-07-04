/**
 * 훈련 포커스 → 성장 강조 능력 매핑 (장기 육성 능동화).
 * 성장 시(progression) 포커스에 해당하는 능력이 더 자주 오른다.
 */
import type { AttrKey, TrainingFocus } from './types.js';

export const TRAINING_FOCUSES: TrainingFocus[] = [
  'balanced', 'finishing', 'playmaking', 'defending', 'physical', 'goalkeeping', 'conditioning',
];

export const TRAINING_LABELS: Record<TrainingFocus, string> = {
  balanced: '균형',
  finishing: '득점',
  playmaking: '창조',
  defending: '수비',
  physical: '피지컬',
  goalkeeping: '골키핑',
  conditioning: '부상방지',
};

/** 포커스별 강조 능력. 'balanced'·'conditioning'은 강조 없음(conditioning은 능력치
 *  대신 부상 확률을 낮춘다 — simulateMatch.ts의 generateInjuries 참고). */
export const TRAINING_FOCUS_ATTRS: Record<TrainingFocus, AttrKey[]> = {
  balanced: [],
  finishing: ['finishing', 'shooting', 'composure', 'offTheBall', 'technique'],
  playmaking: ['passing', 'vision', 'dribbling', 'crossing', 'decisions'],
  defending: ['tackling', 'marking', 'positioning', 'anticipation', 'concentration'],
  physical: ['pace', 'acceleration', 'stamina', 'strength', 'agility'],
  goalkeeping: ['reflexes', 'handling', 'oneOnOne', 'aerialReach', 'goalkicks'],
  conditioning: [],
};
