import { describe, it, expect } from 'vitest';
import { startGame, myClub, renewContract, RENEWAL_MIN_YEARS, RENEWAL_MAX_YEARS } from '../src/game.js';

describe('신규 개선 항목 5: 다년 계약 사인온보너스', () => {
  it('기본값(연도·보너스 생략)으로 호출하면 기존과 동일하게 4년 재계약된다(하위 호환)', () => {
    const g = startGame(2026, 'c0');
    const club = myClub(g);
    const player = club.players[0]!;
    player.contractYears = 1;
    const balBefore = club.finance.balance;
    const baseCost = Math.round(player.wage * 20);

    const r = renewContract(g, player.id);
    expect(r.ok).toBe(true);
    expect(player.contractYears).toBe(4);
    expect(club.finance.balance).toBe(balBefore - baseCost);
  });

  it('계약 기간을 짧게/길게 고르면 계약금이 비례해 줄거나 늘어난다', () => {
    const g = startGame(2027, 'c0');
    const club = myClub(g);
    const player = club.players[0]!;
    player.contractYears = 1;
    const balBefore = club.finance.balance;
    const baseWage = player.wage;

    const r = renewContract(g, player.id, RENEWAL_MIN_YEARS);
    expect(r.ok).toBe(true);
    expect(player.contractYears).toBe(RENEWAL_MIN_YEARS);
    const expectedCost = Math.round(baseWage * 20 * (RENEWAL_MIN_YEARS / 4));
    expect(club.finance.balance).toBe(balBefore - expectedCost);
  });

  it('계약 기간은 RENEWAL_MIN_YEARS~RENEWAL_MAX_YEARS로 clamp된다', () => {
    const g = startGame(2028, 'c0');
    const club = myClub(g);
    const player = club.players[0]!;
    player.contractYears = 1;

    const r = renewContract(g, player.id, 99);
    expect(r.ok).toBe(true);
    expect(player.contractYears).toBe(RENEWAL_MAX_YEARS);
  });

  it('사인온보너스를 얹으면 계약금이 늘고 사기가 기본 재계약보다 더 오른다', () => {
    const g1 = startGame(2029, 'c0');
    const club1 = myClub(g1);
    const player1 = club1.players[0]!;
    player1.contractYears = 1;
    player1.morale = 0.5;
    const baseCost = Math.round(player1.wage * 20);
    const balBefore1 = club1.finance.balance;
    renewContract(g1, player1.id, 4, 0);
    const moraleWithoutBonus = player1.morale;
    expect(club1.finance.balance).toBe(balBefore1 - baseCost);

    const g2 = startGame(2029, 'c0');
    const club2 = myClub(g2);
    const player2 = club2.players[0]!;
    player2.contractYears = 1;
    player2.morale = 0.5;
    const bonus = 50000;
    const balBefore2 = club2.finance.balance;

    const r2 = renewContract(g2, player2.id, 4, bonus);
    expect(r2.ok).toBe(true);
    expect(club2.finance.balance).toBe(balBefore2 - baseCost - bonus);
    expect(player2.morale).toBeGreaterThan(moraleWithoutBonus);
  });

  it('계약금을 감당할 자금이 없으면 거절된다', () => {
    const g = startGame(2030, 'c0');
    const club = myClub(g);
    const player = club.players[0]!;
    player.contractYears = 1;
    club.finance.balance = 0;

    const r = renewContract(g, player.id, 4, 0);
    expect(r.ok).toBe(false);
  });

  it('계약이 아직 2년 넘게 남았으면 재계약이 거절된다', () => {
    const g = startGame(2031, 'c0');
    const club = myClub(g);
    const player = club.players[0]!;
    player.contractYears = 3;

    const r = renewContract(g, player.id, 4, 0);
    expect(r.ok).toBe(false);
  });
});
