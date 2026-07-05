import { describe, it, expect } from 'vitest';
import {
  loanPlayerOut, recallLoanPlayer, applyLoanWageSubsidies,
  buyPlayerAt, sellPlayer, releasePlayer, evaluateOffer, sellOffers, acceptSellOffer,
  MIN_SQUAD, LOAN_MIN_SEASONS, LOAN_MAX_SEASONS,
} from '../src/transferActions.js';
import { runOffseason } from '../src/franchise.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Club } from '../src/types.js';

function makeLeague(seed = 1, n = 4): Club[] {
  const rng = new Rng(seed);
  const clubs: Club[] = [];
  for (let i = 0; i < n; i++) clubs.push(generateClub(rng, `c${i}`, `C${i}`, 12));
  return clubs;
}

describe('A7: 임대 이적', () => {
  it('임대를 보내면 선수가 상대 스쿼드로 옮겨가고 임대 필드가 설정된다', () => {
    const clubs = makeLeague(1);
    const from = clubs[0]!;
    const to = clubs[1]!;
    const player = from.players[from.players.length - 1]!; // 뎁스가 얕지 않은 후보로 가정
    const fromBalance = from.finance.balance;
    const toBalance = to.finance.balance;

    const r = loanPlayerOut(clubs, from.id, to.id, player.id, { seasons: 1, fee: 1000, wageShareByParent: 0.5 });
    expect(r.ok).toBe(true);

    expect(from.players.some((p) => p.id === player.id)).toBe(false);
    expect(to.players.some((p) => p.id === player.id)).toBe(true);
    expect(player.loanFromClubId).toBe(from.id);
    expect(player.loanSeasonsRemaining).toBe(1);
    expect(player.loanWageShareByParent).toBe(0.5);
    expect(from.finance.balance).toBe(fromBalance + 1000);
    expect(to.finance.balance).toBe(toBalance - 1000);
  });

  it('임대 기간은 LOAN_MIN_SEASONS~LOAN_MAX_SEASONS로 clamp된다', () => {
    const clubs = makeLeague(2);
    const from = clubs[0]!;
    const to = clubs[1]!;
    const player = from.players[from.players.length - 1]!;
    const r = loanPlayerOut(clubs, from.id, to.id, player.id, { seasons: 99, fee: 0, wageShareByParent: 0 });
    expect(r.ok).toBe(true);
    expect(player.loanSeasonsRemaining).toBe(LOAN_MAX_SEASONS);
    expect(player.loanSeasonsRemaining).toBeGreaterThanOrEqual(LOAN_MIN_SEASONS);
  });

  it('같은 구단으로는 임대할 수 없다', () => {
    const clubs = makeLeague(3);
    const club = clubs[0]!;
    const player = club.players[club.players.length - 1]!;
    const r = loanPlayerOut(clubs, club.id, club.id, player.id, { seasons: 1, fee: 0, wageShareByParent: 0 });
    expect(r.ok).toBe(false);
  });

  it('최소 스쿼드 인원 미만이 되면 임대를 보낼 수 없다', () => {
    const clubs = makeLeague(4);
    const from = clubs[0]!;
    const to = clubs[1]!;
    while (from.players.length > MIN_SQUAD) from.players.pop();
    const player = from.players[from.players.length - 1]!;
    const r = loanPlayerOut(clubs, from.id, to.id, player.id, { seasons: 1, fee: 0, wageShareByParent: 0 });
    expect(r.ok).toBe(false);
  });

  it('이미 임대 중인 선수는 재임대할 수 없다', () => {
    const clubs = makeLeague(5, 3);
    const a = clubs[0]!; const b = clubs[1]!; const c = clubs[2]!;
    const player = a.players[a.players.length - 1]!;
    loanPlayerOut(clubs, a.id, b.id, player.id, { seasons: 1, fee: 0, wageShareByParent: 0 });
    const r = loanPlayerOut(clubs, b.id, c.id, player.id, { seasons: 1, fee: 0, wageShareByParent: 0 });
    expect(r.ok).toBe(false);
  });

  it('임대 중인 선수는 영입·판매·방출·제안 대상에서 제외된다', () => {
    const clubs = makeLeague(6, 3);
    const from = clubs[0]!; const loanClub = clubs[1]!; const buyer = clubs[2]!;
    const player = from.players[from.players.length - 1]!;
    loanPlayerOut(clubs, from.id, loanClub.id, player.id, { seasons: 2, fee: 0, wageShareByParent: 0 });

    expect(evaluateOffer(clubs, buyer.id, player.id, 1_000_000).ok).toBe(false);
    expect(buyPlayerAt(clubs, buyer.id, player.id, 1_000_000).ok).toBe(false);
    expect(sellPlayer(clubs, loanClub.id, player.id).ok).toBe(false);
    expect(releasePlayer(clubs, loanClub.id, player.id).ok).toBe(false);
    expect(sellOffers(clubs, loanClub.id, player.id)).toHaveLength(0);
    expect(acceptSellOffer(clubs, loanClub.id, player.id, buyer.id).ok).toBe(false);
  });

  it('원 소속 구단은 시즌 중 언제든 임대 선수를 회수(콜백)할 수 있다', () => {
    const clubs = makeLeague(7);
    const from = clubs[0]!; const to = clubs[1]!;
    const player = from.players[from.players.length - 1]!;
    loanPlayerOut(clubs, from.id, to.id, player.id, { seasons: 2, fee: 0, wageShareByParent: 0 });

    const r = recallLoanPlayer(clubs, player.id);
    expect(r.ok).toBe(true);
    expect(from.players.some((p) => p.id === player.id)).toBe(true);
    expect(to.players.some((p) => p.id === player.id)).toBe(false);
    expect(player.loanFromClubId).toBeUndefined();
    expect(player.loanSeasonsRemaining).toBeUndefined();
  });

  it('임대 중이 아닌 선수를 회수하려 하면 실패한다', () => {
    const clubs = makeLeague(8);
    const player = clubs[0]!.players[0]!;
    expect(recallLoanPlayer(clubs, player.id).ok).toBe(false);
  });

  it('오프시즌마다 임대 잔여 시즌이 줄고, 0이 되면 원 소속 구단으로 자동 복귀한다', () => {
    const clubs = makeLeague(9);
    const from = clubs[0]!; const to = clubs[1]!;
    const player = from.players[from.players.length - 1]!;
    loanPlayerOut(clubs, from.id, to.id, player.id, { seasons: 2, fee: 0, wageShareByParent: 0 });

    const r1 = runOffseason(clubs, new Rng(100));
    expect(player.loanSeasonsRemaining).toBe(1);
    expect(to.players.some((p) => p.id === player.id)).toBe(true);
    expect(r1.loanReturns).toHaveLength(0);

    const r2 = runOffseason(clubs, new Rng(101));
    expect(player.loanFromClubId).toBeUndefined();
    expect(player.loanSeasonsRemaining).toBeUndefined();
    expect(to.players.some((p) => p.id === player.id)).toBe(false);
    expect(from.players.some((p) => p.id === player.id)).toBe(true);
    expect(r2.loanReturns).toHaveLength(1);
    expect(r2.loanReturns[0]!.playerId).toBe(player.id);
    expect(r2.loanReturns[0]!.toClubId).toBe(from.id);
  });

  it('applyLoanWageSubsidies는 주급 분담분만큼 원 소속 구단→임대 구단으로 잔고를 이체한다', () => {
    const clubs = makeLeague(10);
    const from = clubs[0]!; const to = clubs[1]!;
    const player = from.players[from.players.length - 1]!;
    loanPlayerOut(clubs, from.id, to.id, player.id, { seasons: 1, fee: 0, wageShareByParent: 0.4 });

    const fromBalance = from.finance.balance;
    const toBalance = to.finance.balance;
    applyLoanWageSubsidies(clubs);
    const expected = Math.round(player.wage * 0.4 * 52);
    expect(from.finance.balance).toBe(fromBalance - expected);
    expect(to.finance.balance).toBe(toBalance + expected);
  });

  it('주급 분담 비율이 0이면 잔고 이체가 발생하지 않는다', () => {
    const clubs = makeLeague(11);
    const from = clubs[0]!; const to = clubs[1]!;
    const player = from.players[from.players.length - 1]!;
    loanPlayerOut(clubs, from.id, to.id, player.id, { seasons: 1, fee: 0, wageShareByParent: 0 });

    const fromBalance = from.finance.balance;
    const toBalance = to.finance.balance;
    applyLoanWageSubsidies(clubs);
    expect(from.finance.balance).toBe(fromBalance);
    expect(to.finance.balance).toBe(toBalance);
  });
});
