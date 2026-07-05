import { describe, it, expect } from 'vitest';
import {
  startGame, myClub, sell, buy, buyAt, negotiate, offersFor, acceptSell, buyback,
} from '../src/game.js';

describe('신규 개선 항목 11: 방출 후 재영입 쿨다운 없음 악용 방지', () => {
  it('판매한 선수는 이번 시즌 buy()로 재영입할 수 없다', () => {
    const g = startGame(2026, 'c0');
    const club = myClub(g);
    const player = club.players[club.players.length - 1]!;

    const sold = sell(g, player.id);
    expect(sold.ok).toBe(true);
    expect(myClub(sold.state).players.some((p) => p.id === player.id)).toBe(false);

    const rebuy = buy(sold.state, player.id);
    expect(rebuy.ok).toBe(false);
    expect(rebuy.message).toContain('재영입');
  });

  it('판매한 선수는 buyAt()으로도 재영입할 수 없다', () => {
    const g = startGame(2027, 'c0');
    const club = myClub(g);
    const player = club.players[club.players.length - 1]!;
    const sold = sell(g, player.id);

    const rebuy = buyAt(sold.state, player.id, 1_000_000_000);
    expect(rebuy.ok).toBe(false);
  });

  it('판매한 선수는 negotiate()로도 재협상을 시작할 수 없다', () => {
    const g = startGame(2028, 'c0');
    const club = myClub(g);
    const player = club.players[club.players.length - 1]!;
    const sold = sell(g, player.id);

    const ev = negotiate(sold.state, player.id, 1);
    expect(ev.ok).toBe(false);
  });

  it('다음 시즌이 되면 다시 재영입할 수 있다', () => {
    const g = startGame(2029, 'c0');
    const club = myClub(g);
    const player = club.players[club.players.length - 1]!;
    const sold = sell(g, player.id);
    const nextSeasonState = { ...sold.state, season: sold.state.season + 1 };

    const rebuy = buy(nextSeasonState, player.id);
    // 쿨다운 자체는 풀렸으니 실패하더라도 쿨다운 메시지는 아니어야 한다.
    expect(rebuy.message).not.toContain('재영입할 수 없습니다');
  });

  it('바이백 조항을 붙여 판매하면(Item2) 쿨다운이 걸리지 않고, buyback()으로 즉시 재영입할 수 있다', () => {
    const g = startGame(2030, 'c0');
    const club = myClub(g);
    const player = club.players[0]!;
    const offers = offersFor(g, player.id);
    const buyerId = offers[0]!.clubId;
    const buybackFee = offers[0]!.bid + 20000;

    const sold = acceptSell(g, player.id, buyerId, buybackFee);
    expect(sold.ok).toBe(true);

    const boughtBack = buyback(sold.state, player.id);
    expect(boughtBack.ok).toBe(true);
    expect(myClub(boughtBack.state).players.some((p) => p.id === player.id)).toBe(true);
  });

  it('다른 선수를 판매해도 판매하지 않은 선수에는 쿨다운이 걸리지 않는다', () => {
    const g = startGame(2031, 'c0');
    const club = myClub(g);
    const playerA = club.players[club.players.length - 1]!;
    const playerB = club.players[club.players.length - 2]!;
    const sold = sell(g, playerA.id);

    expect(sold.state.soldPlayerCooldowns?.[playerA.id]).toBeDefined();
    expect(sold.state.soldPlayerCooldowns?.[playerB.id]).toBeUndefined();
  });
});
