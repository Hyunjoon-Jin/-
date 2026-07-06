import { describe, it, expect } from 'vitest';
import { startGame, myClub, upgradeTrainingGroundAction } from '../src/game.js';
import { TRAINING_GROUND_MAX, trainingGroundUpgradeCost } from '@soccer-tycoon/engine';

describe('신규 개선 항목 21: 훈련장(피지컬 트레이닝) 시설 (앱 통합)', () => {
  it('자금이 충분하면 증축되고 비용이 차감된다', () => {
    const g = startGame(2026, 'c0');
    const club = myClub(g);
    club.finance.balance = 10_000_000;
    club.finance.trainingGroundLevel = 2;
    const before = club.finance.balance;
    const cost = trainingGroundUpgradeCost(2);

    const outcome = upgradeTrainingGroundAction(g);
    expect(outcome.ok).toBe(true);
    expect(club.finance.trainingGroundLevel).toBe(3);
    expect(club.finance.balance).toBe(before - cost);
  });

  it('자금이 부족하면 거절되고 상태가 변하지 않는다', () => {
    const g = startGame(2027, 'c0');
    const club = myClub(g);
    club.finance.balance = 0;
    club.finance.trainingGroundLevel = 0;

    const outcome = upgradeTrainingGroundAction(g);
    expect(outcome.ok).toBe(false);
    expect(club.finance.trainingGroundLevel).toBe(0);
  });

  it('최대 레벨에서는 더 증축할 수 없다', () => {
    const g = startGame(2028, 'c0');
    const club = myClub(g);
    club.finance.balance = 999_999_999;
    club.finance.trainingGroundLevel = TRAINING_GROUND_MAX;

    const outcome = upgradeTrainingGroundAction(g);
    expect(outcome.ok).toBe(false);
    expect(club.finance.trainingGroundLevel).toBe(TRAINING_GROUND_MAX);
  });
});
