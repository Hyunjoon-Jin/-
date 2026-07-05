import { describe, it, expect } from 'vitest';
import {
  loanPlayerOut, recallLoanPlayer, applyLoanWageSubsidies, exerciseLoanBuyOption,
  buyPlayerAt, sellPlayer, releasePlayer, evaluateOffer, sellOffers, acceptSellOffer,
  MIN_SQUAD, LOAN_MIN_SEASONS, LOAN_MAX_SEASONS, LOAN_OBLIGATION_MAX_APPS,
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

describe('A1: 임대 의무완전이적 조항', () => {
  it('임대 시 조항을 지정하면 출전 기준·이적료가 clamp되어 저장된다', () => {
    const clubs = makeLeague(20);
    const from = clubs[0]!; const to = clubs[1]!;
    const player = from.players[from.players.length - 1]!;
    const r = loanPlayerOut(clubs, from.id, to.id, player.id, {
      seasons: 2, fee: 0, wageShareByParent: 0, buyObligation: { appearances: 999, fee: -50 },
    });
    expect(r.ok).toBe(true);
    expect(player.loanBuyObligation).toEqual({ appearances: LOAN_OBLIGATION_MAX_APPS, fee: 0 });
  });

  it('시즌 출전이 기준에 못 미치면 임대가 그대로 유지된다(자연 만료 로직 그대로)', () => {
    const clubs = makeLeague(21);
    const from = clubs[0]!; const to = clubs[1]!;
    const player = from.players[from.players.length - 1]!;
    loanPlayerOut(clubs, from.id, to.id, player.id, {
      seasons: 1, fee: 0, wageShareByParent: 0, buyObligation: { appearances: 20, fee: 5000 },
    });
    player.seasonApps = 5; // 기준(20) 미달

    const r = runOffseason(clubs, new Rng(200));
    expect(r.loanObligations).toHaveLength(0);
    expect(r.loanReturns).toHaveLength(1); // 시즌 1개뿐이라 자연 만료로 원 소속 복귀
    expect(from.players.some((p) => p.id === player.id)).toBe(true);
  });

  it('시즌 출전이 기준에 도달하면 잔여 임대 기간과 무관하게 완전 이적으로 전환된다', () => {
    const clubs = makeLeague(22);
    const from = clubs[0]!; const to = clubs[1]!;
    const player = from.players[from.players.length - 1]!;
    loanPlayerOut(clubs, from.id, to.id, player.id, {
      seasons: 2, fee: 0, wageShareByParent: 0, buyObligation: { appearances: 15, fee: 8000 },
    });
    player.seasonApps = 18; // 기준(15) 이상 — 잔여 임대가 1시즌 남았어도 즉시 전환

    const fromBalance = from.finance.balance;
    const toBalance = to.finance.balance;
    const r = runOffseason(clubs, new Rng(201));

    expect(r.loanObligations).toHaveLength(1);
    expect(r.loanObligations[0]).toMatchObject({
      playerId: player.id, fromClubId: from.id, toClubId: to.id, fee: 8000,
    });
    expect(r.loanReturns).toHaveLength(0); // 완전 이적이라 "복귀"가 아니다.
    expect(to.players.some((p) => p.id === player.id)).toBe(true); // 임대 갔던 구단에 그대로 남는다.
    expect(from.players.some((p) => p.id === player.id)).toBe(false);
    expect(player.loanFromClubId).toBeUndefined();
    expect(player.loanSeasonsRemaining).toBeUndefined();
    expect(player.loanBuyObligation).toBeUndefined();
    expect(to.finance.balance).toBe(toBalance - 8000);
    expect(from.finance.balance).toBe(fromBalance + 8000);
  });

  it('자금이 부족해도 계약상 의무이므로 강제 집행된다(자금 부족→재정 위기 강제매각까지 이어짐)', () => {
    const clubs = makeLeague(23);
    const from = clubs[0]!; const to = clubs[1]!;
    const player = from.players[from.players.length - 1]!;
    const fromBalance = from.finance.balance;
    const hugeFee = to.finance.balance + 1_000_000;
    loanPlayerOut(clubs, from.id, to.id, player.id, {
      seasons: 1, fee: 0, wageShareByParent: 0, buyObligation: { appearances: 1, fee: hugeFee },
    });
    player.seasonApps = 10;

    const r = runOffseason(clubs, new Rng(202));
    expect(r.loanObligations).toHaveLength(1);
    // 판매자(원 소속)는 정상적으로 이적료를 받는다.
    expect(from.finance.balance).toBe(fromBalance + hugeFee);
    // 구매자(임대 갔던 구단)는 감당 못 할 금액이라도 강제 집행되어 잔고가 크게 깎이고,
    // 같은 오프시즌 내 재정 위기 로직(enforceFinancialFairPlay)이 즉시 강제매각으로 수습한다.
    expect(r.fireSalesByClub.get(to.id) ?? 0).toBeGreaterThan(0);
  });

  it('시즌 중 회수(콜백)하면 의무완전이적 조항도 함께 해제된다', () => {
    const clubs = makeLeague(24);
    const from = clubs[0]!; const to = clubs[1]!;
    const player = from.players[from.players.length - 1]!;
    loanPlayerOut(clubs, from.id, to.id, player.id, {
      seasons: 1, fee: 0, wageShareByParent: 0, buyObligation: { appearances: 5, fee: 1000 },
    });
    recallLoanPlayer(clubs, player.id);
    expect(player.loanBuyObligation).toBeUndefined();
  });
});

describe('Item4: 임대 우선매수옵션(OTB)', () => {
  it('임대 시 우선매수옵션을 지정하면 선수에게 loanBuyOption이 붙는다', () => {
    const clubs = makeLeague(30);
    const from = clubs[0]!; const to = clubs[1]!;
    const player = from.players[from.players.length - 1]!;
    const r = loanPlayerOut(clubs, from.id, to.id, player.id, {
      seasons: 2, fee: 0, wageShareByParent: 0, buyOption: { fee: 5000 },
    });
    expect(r.ok).toBe(true);
    expect(player.loanBuyOption).toEqual({ fee: 5000 });
  });

  it('임대 구단이 우선매수옵션을 행사하면 즉시 완전 영입되어 임대가 종료된다', () => {
    const clubs = makeLeague(31);
    const from = clubs[0]!; const to = clubs[1]!;
    const player = from.players[from.players.length - 1]!;
    loanPlayerOut(clubs, from.id, to.id, player.id, {
      seasons: 2, fee: 0, wageShareByParent: 0, buyOption: { fee: 8000 },
    });
    const fromBalance = from.finance.balance;
    const toBalance = to.finance.balance;

    const r = exerciseLoanBuyOption(clubs, to.id, player.id);
    expect(r.ok).toBe(true);
    expect(r.fee).toBe(8000);
    expect(to.players.some((p) => p.id === player.id)).toBe(true);
    expect(from.players.some((p) => p.id === player.id)).toBe(false);
    expect(player.loanFromClubId).toBeUndefined();
    expect(player.loanSeasonsRemaining).toBeUndefined();
    expect(player.loanBuyOption).toBeUndefined();
    expect(to.finance.balance).toBe(toBalance - 8000);
    expect(from.finance.balance).toBe(fromBalance + 8000);
  });

  it('옵션이 없는 임대 선수는 행사할 수 없다', () => {
    const clubs = makeLeague(32);
    const from = clubs[0]!; const to = clubs[1]!;
    const player = from.players[from.players.length - 1]!;
    loanPlayerOut(clubs, from.id, to.id, player.id, { seasons: 1, fee: 0, wageShareByParent: 0 });
    const r = exerciseLoanBuyOption(clubs, to.id, player.id);
    expect(r.ok).toBe(false);
  });

  it('임대 구단이 아닌 다른 구단은 옵션을 행사할 수 없다', () => {
    const clubs = makeLeague(33, 3);
    const from = clubs[0]!; const to = clubs[1]!; const thirdParty = clubs[2]!;
    const player = from.players[from.players.length - 1]!;
    loanPlayerOut(clubs, from.id, to.id, player.id, {
      seasons: 1, fee: 0, wageShareByParent: 0, buyOption: { fee: 3000 },
    });
    const r = exerciseLoanBuyOption(clubs, thirdParty.id, player.id);
    expect(r.ok).toBe(false);
  });

  it('자금이 부족하면 옵션 행사가 거절된다', () => {
    const clubs = makeLeague(34);
    const from = clubs[0]!; const to = clubs[1]!;
    const player = from.players[from.players.length - 1]!;
    const hugeFee = to.finance.balance + 1_000_000;
    loanPlayerOut(clubs, from.id, to.id, player.id, {
      seasons: 1, fee: 0, wageShareByParent: 0, buyOption: { fee: hugeFee },
    });
    const r = exerciseLoanBuyOption(clubs, to.id, player.id);
    expect(r.ok).toBe(false);
  });

  it('옵션을 행사하지 않고 임대가 자연 만료되면 옵션이 소멸한다', () => {
    const clubs = makeLeague(35);
    const from = clubs[0]!; const to = clubs[1]!;
    const player = from.players[from.players.length - 1]!;
    loanPlayerOut(clubs, from.id, to.id, player.id, {
      seasons: 1, fee: 0, wageShareByParent: 0, buyOption: { fee: 5000 },
    });
    runOffseason(clubs, new Rng(300));
    expect(from.players.some((p) => p.id === player.id)).toBe(true);
    expect(player.loanBuyOption).toBeUndefined();
  });

  it('시즌 중 회수(콜백)하면 우선매수옵션도 함께 해제된다', () => {
    const clubs = makeLeague(36);
    const from = clubs[0]!; const to = clubs[1]!;
    const player = from.players[from.players.length - 1]!;
    loanPlayerOut(clubs, from.id, to.id, player.id, {
      seasons: 1, fee: 0, wageShareByParent: 0, buyOption: { fee: 5000 },
    });
    recallLoanPlayer(clubs, player.id);
    expect(player.loanBuyOption).toBeUndefined();
  });
});
