import { describe, it, expect } from 'vitest';
import { startGame, myClub, swapDeal } from '../src/game.js';

describe('A2: 스와프 딜 (앱 통합)', () => {
  it('맞교환하면 내 스쿼드에서 내 선수가 빠지고 상대 선수가 들어온다', () => {
    const g = startGame(2026, 'c0');
    const club = myClub(g);
    const myPlayer = club.players[club.players.length - 1]!;
    const otherClub = g.clubs.find((c) => c.id !== g.myClubId)!;
    const otherPlayer = otherClub.players[otherClub.players.length - 1]!;

    const outcome = swapDeal(g, myPlayer.id, otherClub.id, otherPlayer.id, 0);
    expect(outcome.ok).toBe(true);
    const next = myClub(outcome.state);
    expect(next.players.some((p) => p.id === myPlayer.id)).toBe(false);
    expect(next.players.some((p) => p.id === otherPlayer.id)).toBe(true);
  });

  it('정산금이 양수면 내 구단 자금이 그만큼 줄어든다', () => {
    const g = startGame(2027, 'c0');
    const club = myClub(g);
    const myPlayer = club.players[club.players.length - 1]!;
    const otherClub = g.clubs.find((c) => c.id !== g.myClubId)!;
    const otherPlayer = otherClub.players[otherClub.players.length - 1]!;
    const before = club.finance.balance;

    const outcome = swapDeal(g, myPlayer.id, otherClub.id, otherPlayer.id, 3000);
    expect(outcome.ok).toBe(true);
    expect(myClub(outcome.state).finance.balance).toBe(before - 3000);
  });

  it('시즌 진행 중에는 맞교환할 수 없다', () => {
    const g = startGame(2028, 'c0');
    const live = { ...g, live: {} as never };
    const club = myClub(live);
    const myPlayer = club.players[0]!;
    const otherClub = live.clubs.find((c) => c.id !== live.myClubId)!;
    const otherPlayer = otherClub.players[0]!;
    const outcome = swapDeal(live, myPlayer.id, otherClub.id, otherPlayer.id, 0);
    expect(outcome.ok).toBe(false);
  });
});

describe('신규 개선 항목 8: 스와프 딜에 유스(리저브) 선수 포함 (앱 통합)', () => {
  it('내 리저브 선수를 내놓아 상대 1군 선수와 맞교환할 수 있다', () => {
    const g = startGame(2029, 'c0');
    const club = myClub(g);
    const youth = club.players[club.players.length - 1]!;
    club.players = club.players.filter((p) => p.id !== youth.id);
    club.reserves = [youth];
    const otherClub = g.clubs.find((c) => c.id !== g.myClubId)!;
    const otherPlayer = otherClub.players[otherClub.players.length - 1]!;

    const outcome = swapDeal(g, youth.id, otherClub.id, otherPlayer.id, 0);
    expect(outcome.ok).toBe(true);
    const next = myClub(outcome.state);
    expect((next.reserves ?? []).some((p) => p.id === youth.id)).toBe(false);
    expect(next.players.some((p) => p.id === otherPlayer.id)).toBe(true);
  });

  it('상대 구단의 리저브 선수를 받는 크로스티어 딜도 성립한다', () => {
    const g = startGame(2030, 'c0');
    const club = myClub(g);
    const myPlayer = club.players[club.players.length - 1]!;
    const otherClub = g.clubs.find((c) => c.id !== g.myClubId)!;
    const theirYouth = otherClub.players[otherClub.players.length - 1]!;
    otherClub.players = otherClub.players.filter((p) => p.id !== theirYouth.id);
    otherClub.reserves = [theirYouth];

    const outcome = swapDeal(g, myPlayer.id, otherClub.id, theirYouth.id, 0);
    expect(outcome.ok).toBe(true);
    const next = myClub(outcome.state);
    expect((next.reserves ?? []).some((p) => p.id === theirYouth.id)).toBe(true);
    expect(next.players.some((p) => p.id === myPlayer.id)).toBe(false);
  });
});
