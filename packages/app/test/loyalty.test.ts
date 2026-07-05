import { describe, it, expect } from 'vitest';
import { startGame, myClub, renewContract } from '../src/game.js';
import { LOYALTY_LEGEND_SEASONS, LOYALTY_MAX_DISCOUNT } from '@soccer-tycoon/engine';

describe('신규 개선 항목 10: 로열티 보너스 (앱 통합)', () => {
  it('로열티가 없는(신규 영입 등) 선수는 재계약 계약금에 할인이 없다', () => {
    const g = startGame(2026, 'c0');
    const club = myClub(g);
    const player = club.players[0]!;
    player.contractYears = 1;
    player.seasonsAtClub = 0;
    const balBefore = club.finance.balance;
    const baseCost = Math.round(player.wage * 20);

    const r = renewContract(g, player.id);
    expect(r.ok).toBe(true);
    expect(club.finance.balance).toBe(balBefore - baseCost);
    expect(r.message).not.toContain('로열티');
  });

  it('legend 등급(오래 재적)이면 재계약 계약금이 최대 할인율만큼 저렴해진다', () => {
    const g = startGame(2027, 'c0');
    const club = myClub(g);
    const player = club.players[0]!;
    player.contractYears = 1;
    player.seasonsAtClub = LOYALTY_LEGEND_SEASONS;
    const balBefore = club.finance.balance;
    const expectedCost = Math.round(player.wage * 20 * (1 - LOYALTY_MAX_DISCOUNT));

    const r = renewContract(g, player.id);
    expect(r.ok).toBe(true);
    expect(club.finance.balance).toBe(balBefore - expectedCost);
    expect(r.message).toContain('로열티');
  });
});
