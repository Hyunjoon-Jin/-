import { describe, it, expect } from 'vitest';
import { startGame, myClub, offersFor, acceptSell, renegotiateBuybackClauseAction } from '../src/game.js';
import { marketValue, BUYBACK_VALUE_INCREASE_RATIO, BUYBACK_VALUE_DECREASE_RATIO } from '@soccer-tycoon/engine';

describe('고도화 Item5: 바이백 조항 협상형 재구성 (앱 통합)', () => {
  it('선수 가치가 충분히 오르면 현재 구단이 바이백 금액 인상을 요청해 성사시킬 수 있다', () => {
    const g = startGame(3026, 'c0');
    const club = myClub(g);
    const player = club.players[0]!;
    const offers = offersFor(g, player.id);
    const buyerId = offers[0]!.clubId;

    const soldOutcome = acceptSell(g, player.id, buyerId, offers[0]!.bid + 1);
    const buyerClub = soldOutcome.state.clubs.find((c) => c.id === buyerId)!;
    const soldPlayer = buyerClub.players.find((p) => p.id === player.id)!;
    const value = marketValue(soldPlayer);
    soldPlayer.buybackClause!.fee = Math.round(value / (BUYBACK_VALUE_INCREASE_RATIO + 0.1));

    const r = renegotiateBuybackClauseAction(soldOutcome.state, player.id, 'increase');
    expect(r.ok).toBe(true);
    expect(r.message).toContain('조정');
  });

  it('선수 가치가 충분히 떨어지면 원 소속 구단이 인하를 요청해 성사시킬 수 있다', () => {
    const g = startGame(3027, 'c0');
    const club = myClub(g);
    const player = club.players[0]!;
    const offers = offersFor(g, player.id);
    const buyerId = offers[0]!.clubId;

    const soldOutcome = acceptSell(g, player.id, buyerId, offers[0]!.bid + 1);
    const buyerClub = soldOutcome.state.clubs.find((c) => c.id === buyerId)!;
    const soldPlayer = buyerClub.players.find((p) => p.id === player.id)!;
    const value = marketValue(soldPlayer);
    soldPlayer.buybackClause!.fee = Math.round(value / (BUYBACK_VALUE_DECREASE_RATIO - 0.1));

    const r = renegotiateBuybackClauseAction(soldOutcome.state, player.id, 'decrease');
    expect(r.ok).toBe(true);
  });

  it('한 시즌에 두 번째 시도는 거절된다', () => {
    const g = startGame(3028, 'c0');
    const club = myClub(g);
    const player = club.players[0]!;
    const offers = offersFor(g, player.id);
    const buyerId = offers[0]!.clubId;

    const soldOutcome = acceptSell(g, player.id, buyerId, offers[0]!.bid + 1);
    const buyerClub = soldOutcome.state.clubs.find((c) => c.id === buyerId)!;
    const soldPlayer = buyerClub.players.find((p) => p.id === player.id)!;
    const value = marketValue(soldPlayer);
    soldPlayer.buybackClause!.fee = Math.round(value); // 어느 방향도 거절될 상황

    const first = renegotiateBuybackClauseAction(soldOutcome.state, player.id, 'increase');
    expect(first.ok).toBe(false);
    const second = renegotiateBuybackClauseAction(first.state, player.id, 'decrease');
    expect(second.ok).toBe(false);
    expect(second.message).toContain('이미');
  });

  it('바이백 조항이 없는 선수는 재협상할 수 없다', () => {
    const g = startGame(3029, 'c0');
    const player = myClub(g).players[0]!;
    const r = renegotiateBuybackClauseAction(g, player.id, 'increase');
    expect(r.ok).toBe(false);
  });
});
