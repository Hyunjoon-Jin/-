import { describe, it, expect } from 'vitest';
import {
  transferTargets, buyPlayer, buyPlayerAt, buyPlayerViaReleaseClause, sellPlayer, releasePlayer,
  askingPrice, evaluateOffer, MAX_NEGOTIATION_ROUNDS, MIN_SQUAD, swapPlayers, loanPlayerOut,
} from '../src/transferActions.js';
import { marketValue, agentFee } from '../src/valuation.js';
import { currentAbility } from '../src/derived.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Club } from '../src/types.js';

function makeLeague(seed = 1): Club[] {
  const rng = new Rng(seed);
  const clubs: Club[] = [];
  for (let i = 0; i < 6; i++) {
    const tier = 8 + Math.round((i / 5) * 8);
    clubs.push(generateClub(rng, `c${i}`, `C${i}`, tier));
  }
  return clubs;
}

describe('transferActions: 영입', () => {
  it('타 구단 선수만 매물에 오른다', () => {
    const clubs = makeLeague();
    const targets = transferTargets(clubs, 'c0');
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((t) => t.clubId !== 'c0')).toBe(true);
  });

  it('영입 시 선수 이동·예산 차감·매도 구단 입금이 일관된다', () => {
    const clubs = makeLeague();
    const me = clubs.find((c) => c.id === 'c0')!;
    // 예산 내 매물 하나 고르기
    const target = transferTargets(clubs, 'c0')
      .filter((t) => t.value <= me.finance.transferBudget)
      .sort((a, b) => a.value - b.value)[0]!;
    const seller = clubs.find((c) => c.id === target.clubId)!;
    const myBudget = me.finance.transferBudget;
    const sellerBal = seller.finance.balance;
    const mySize = me.players.length;
    const sellerSize = seller.players.length;

    const r = buyPlayer(clubs, 'c0', target.player.id);
    expect(r.ok).toBe(true);
    expect(me.finance.transferBudget).toBe(myBudget - r.fee!);
    expect(seller.finance.balance).toBe(sellerBal + r.fee!);
    expect(me.players.length).toBe(mySize + 1);
    expect(seller.players.length).toBe(sellerSize - 1);
    expect(me.players.some((p) => p.id === target.player.id)).toBe(true);
  });

  it('예산을 초과하면 영입에 실패한다', () => {
    const clubs = makeLeague();
    const me = clubs.find((c) => c.id === 'c0')!;
    me.finance.transferBudget = 0;
    const target = transferTargets(clubs, 'c0')[0]!;
    const r = buyPlayer(clubs, 'c0', target.player.id);
    expect(r.ok).toBe(false);
  });

  it('상대 구단의 유일한 골키퍼처럼, 해당 라인이 바닥날 매입은 거절된다', () => {
    const clubs = makeLeague();
    const me = clubs.find((c) => c.id === 'c0')!;
    me.finance.transferBudget = 999_999_999;
    me.finance.balance = 999_999_999;
    const seller = clubs.find((c) => c.id !== 'c0')!;
    const gks = seller.players.filter((p) => p.position === 'GK');
    // 골키퍼를 1명만 남긴다.
    for (const gk of gks.slice(1)) seller.players = seller.players.filter((p) => p.id !== gk.id);
    const lastGk = seller.players.find((p) => p.position === 'GK')!;

    const r = buyPlayerAt(clubs, 'c0', lastGk.id, askingPrice(seller, lastGk));
    expect(r.ok).toBe(false);
    expect(seller.players.some((p) => p.id === lastGk.id)).toBe(true);
  });

  it('충분한 뎁스가 있는 라인의 선수는 정상적으로 매입할 수 있다', () => {
    const clubs = makeLeague();
    const me = clubs.find((c) => c.id === 'c0')!;
    me.finance.transferBudget = 999_999_999;
    me.finance.balance = 999_999_999;
    const seller = clubs.find((c) => c.id !== 'c0')!;
    const gks = seller.players.filter((p) => p.position === 'GK');
    expect(gks.length).toBeGreaterThanOrEqual(2); // 기본 생성 스쿼드는 GK 2명 보유
    const r = buyPlayerAt(clubs, 'c0', gks[0]!.id, askingPrice(seller, gks[0]!));
    expect(r.ok).toBe(true);
  });

  it('buyPlayer(시장가 즉시 영입)는 라인 내 핵심 선수(rank 0)라도 항상 성사된다', () => {
    // buyPlayerAt에 호가의 82% 하한이 생긴 뒤로, marketValue만 내면 importance
    // 프리미엄이 붙는 핵심 선수(rank 0, ×1.4)는 하한 미달로 거절될 수 있었다.
    // buyPlayer는 반드시 askingPrice(시장가 아님) 기준으로 값을 치러야 한다.
    const clubs = makeLeague();
    const me = clubs.find((c) => c.id === 'c0')!;
    me.finance.transferBudget = 999_999_999;
    me.finance.balance = 999_999_999;
    const seller = clubs.find((c) => c.id !== 'c0')!;
    const core = [...seller.players].sort((a, b) => currentAbility(b) - currentAbility(a))[0]!;
    const before = seller.players.length;
    const r = buyPlayer(clubs, 'c0', core.id);
    expect(r.ok).toBe(true);
    expect(seller.players.length).toBe(before - 1);
    expect(me.players.some((p) => p.id === core.id)).toBe(true);
  });
});

describe('transferActions: 판매/방출', () => {
  it('판매 시 내 구단에 입금되고 선수가 빠진다', () => {
    const clubs = makeLeague();
    const me = clubs.find((c) => c.id === 'c0')!;
    const player = me.players[0]!;
    const balBefore = me.finance.balance;
    const sizeBefore = me.players.length;

    const r = sellPlayer(clubs, 'c0', player.id);
    expect(r.ok).toBe(true);
    expect(me.finance.balance).toBe(balBefore + r.fee!);
    expect(me.players.length).toBe(sizeBefore - 1);
    expect(me.players.some((p) => p.id === player.id)).toBe(false);
    // 판매가는 시장가의 92% (할인)
    expect(r.fee!).toBeLessThanOrEqual(marketValue(player));
  });

  it('전체 선수 수는 판매 전후로 보존된다(다른 구단이 영입)', () => {
    const clubs = makeLeague();
    const before = clubs.reduce((s, c) => s + c.players.length, 0);
    sellPlayer(clubs, 'c0', clubs[0]!.players[0]!.id);
    const after = clubs.reduce((s, c) => s + c.players.length, 0);
    expect(after).toBe(before);
  });

  it('방출은 수입 없이 선수를 내보낸다', () => {
    const clubs = makeLeague();
    const me = clubs.find((c) => c.id === 'c0')!;
    const player = me.players[0]!;
    const balBefore = me.finance.balance;
    const r = releasePlayer(clubs, 'c0', player.id);
    expect(r.ok).toBe(true);
    expect(me.finance.balance).toBe(balBefore); // 수입 없음
    expect(me.players.some((p) => p.id === player.id)).toBe(false);
  });

  it('최소 스쿼드 인원 이하로는 판매/방출할 수 없다', () => {
    const clubs = makeLeague();
    const me = clubs.find((c) => c.id === 'c0')!;
    // MIN_SQUAD까지 방출
    while (me.players.length > MIN_SQUAD) {
      releasePlayer(clubs, 'c0', me.players[me.players.length - 1]!.id);
    }
    const r = releasePlayer(clubs, 'c0', me.players[0]!.id);
    expect(r.ok).toBe(false);
    const s = sellPlayer(clubs, 'c0', me.players[0]!.id);
    expect(s.ok).toBe(false);
  });
});

describe('transferActions: 다회차 협상(A01)', () => {
  it('라운드가 진행될수록 매도 구단의 호가가 조급증만큼 오른다', () => {
    const clubs = makeLeague();
    const me = clubs.find((c) => c.id === 'c0')!;
    me.finance.transferBudget = 999_999_999;
    me.finance.balance = 999_999_999;
    const seller = clubs.find((c) => c.id !== 'c0')!;
    const player = seller.players[0]!;
    const base = evaluateOffer(clubs, 'c0', player.id, 1, 0);
    const laterRound = evaluateOffer(clubs, 'c0', player.id, 1, MAX_NEGOTIATION_ROUNDS);
    expect(laterRound.asking!).toBeGreaterThan(base.asking!);
  });

  it('라운드 상한을 넘기면 역제안 없이 협상이 결렬된다', () => {
    const clubs = makeLeague();
    const me = clubs.find((c) => c.id === 'c0')!;
    me.finance.transferBudget = 999_999_999;
    me.finance.balance = 999_999_999;
    const seller = clubs.find((c) => c.id !== 'c0')!;
    const player = seller.players[0]!;
    const asking = askingPrice(seller, player);
    // 라운드가 늘수록 호가에 조급증이 붙어 오르지만(floor도 같은 비율로 오름), 0.95배는
    // 최대 라운드의 조급증을 반영해도 항상 floor보다 높고 asking보다는 낮은 안전한 구간.
    const lowball = Math.round(asking * 0.95);
    const withinRounds = evaluateOffer(clubs, 'c0', player.id, lowball, MAX_NEGOTIATION_ROUNDS - 1);
    expect(withinRounds.outcome).toBe('countered');
    const exhausted = evaluateOffer(clubs, 'c0', player.id, lowball, MAX_NEGOTIATION_ROUNDS + 1);
    expect(exhausted.outcome).toBe('rejected');
    expect(exhausted.roundsExhausted).toBe(true);
  });

  it('호가 이상을 제시하면 라운드와 무관하게 수락된다', () => {
    const clubs = makeLeague();
    const me = clubs.find((c) => c.id === 'c0')!;
    me.finance.transferBudget = 999_999_999;
    me.finance.balance = 999_999_999;
    const seller = clubs.find((c) => c.id !== 'c0')!;
    const player = seller.players[0]!;
    // 라운드가 진행될수록 조급증으로 호가 자체가 오르므로, 그 상한(round=MAX)을
    // 반영해도 넉넉히 웃도는 금액을 제시한다.
    const overwhelming = Math.round(askingPrice(seller, player) * 2);
    const r = evaluateOffer(clubs, 'c0', player.id, overwhelming, MAX_NEGOTIATION_ROUNDS + 5);
    expect(r.outcome).toBe('accepted');
  });
});

describe('transferActions: 에이전트 수수료(A02)', () => {
  it('영입 시 이적료와 별개로 에이전트 수수료가 산정돼 잔고에서 추가로 차감된다', () => {
    const clubs = makeLeague();
    const me = clubs.find((c) => c.id === 'c0')!;
    me.finance.transferBudget = 999_999_999;
    me.finance.balance = 999_999_999;
    const seller = clubs.find((c) => c.id !== 'c0')!;
    const player = seller.players[0]!;
    const fee = askingPrice(seller, player);
    const budgetBefore = me.finance.transferBudget;
    const balanceBefore = me.finance.balance;

    const r = buyPlayerAt(clubs, 'c0', player.id, fee);
    expect(r.ok).toBe(true);
    expect(r.agentFee).toBe(agentFee(fee, 4));
    expect(r.agentFee!).toBeGreaterThan(0);
    // 이적 예산은 이적료만큼만 차감
    expect(me.finance.transferBudget).toBe(budgetBefore - fee);
    // 잔고는 이적료 + 에이전트 수수료만큼 차감
    expect(me.finance.balance).toBe(balanceBefore - fee - r.agentFee!);
  });

  it('이적료는 감당해도 에이전트 수수료까지 감당하지 못하면 영입이 거절된다', () => {
    const clubs = makeLeague();
    const me = clubs.find((c) => c.id === 'c0')!;
    const seller = clubs.find((c) => c.id !== 'c0')!;
    const player = seller.players[0]!;
    const fee = askingPrice(seller, player);
    me.finance.transferBudget = fee + 1;
    me.finance.balance = fee; // 수수료를 낼 여유가 없음
    const r = buyPlayerAt(clubs, 'c0', player.id, fee);
    expect(r.ok).toBe(false);
  });
});

describe('transferActions: 방출(바이아웃) 조항(A03)', () => {
  function findPlayerWithClause(): { clubs: Club[]; clubId: string; playerId: string } | null {
    for (let seed = 1; seed < 40; seed++) {
      const clubs = makeLeague(seed);
      for (const club of clubs) {
        const p = club.players.find((pl) => pl.releaseClause !== undefined);
        if (p) return { clubs, clubId: club.id, playerId: p.id };
      }
    }
    return null;
  }

  it('방출조항이 설정된 선수는 협상 없이 조항 금액으로 즉시 영입된다', () => {
    const found = findPlayerWithClause();
    expect(found).not.toBeNull();
    const { clubs, clubId, playerId } = found!;
    const seller = clubs.find((c) => c.id === clubId)!;
    const player = seller.players.find((p) => p.id === playerId)!;
    const clause = player.releaseClause!;
    const me = clubs.find((c) => c.id !== clubId)!;
    me.finance.transferBudget = clause * 2;
    me.finance.balance = clause * 2;
    const sellerBalBefore = seller.finance.balance;

    const r = buyPlayerViaReleaseClause(clubs, me.id, playerId);
    expect(r.ok).toBe(true);
    expect(r.fee).toBe(clause);
    expect(seller.finance.balance).toBe(sellerBalBefore + clause);
    expect(me.players.some((p) => p.id === playerId)).toBe(true);
    // 새 구단에서는 조항이 사라진다(재협상 전제).
    expect(me.players.find((p) => p.id === playerId)!.releaseClause).toBeUndefined();
  });

  it('방출조항이 없는 선수는 실패한다', () => {
    const clubs = makeLeague();
    const me = clubs.find((c) => c.id === 'c0')!;
    const seller = clubs.find((c) => c.id !== 'c0')!;
    const noClausePlayer = seller.players.find((p) => p.releaseClause === undefined);
    expect(noClausePlayer).toBeDefined();
    const r = buyPlayerViaReleaseClause(clubs, 'c0', noClausePlayer!.id);
    expect(r.ok).toBe(false);
  });

  it('방출조항은 라인 뎁스 제약과 무관하게 조항 금액 그대로 성사된다(일반 협상이었다면 거절됐을 상황)', () => {
    const clubs = makeLeague();
    const me = clubs.find((c) => c.id === 'c0')!;
    me.finance.transferBudget = 999_999_999;
    me.finance.balance = 999_999_999;
    const seller = clubs.find((c) => c.id !== 'c0')!;
    const gks = seller.players.filter((p) => p.position === 'GK');
    expect(gks.length).toBeGreaterThanOrEqual(2);
    const target = gks[0]!;
    // 자연 롤과 무관하게 시나리오를 통제하기 위해 조항을 직접 부여.
    const clause = Math.round(marketValue(target) * 1.5);
    target.releaseClause = clause;
    // 다른 GK를 모두 제거해 라인 뎁스를 바닥낸다.
    seller.players = seller.players.filter((p) => p.id === target.id || p.position !== 'GK');

    const normal = buyPlayerAt(clubs, 'c0', target.id, clause);
    expect(normal.ok).toBe(false); // 뎁스 부족으로 일반 협상 경로는 거절

    const viaClause = buyPlayerViaReleaseClause(clubs, 'c0', target.id);
    expect(viaClause.ok).toBe(true); // 방출조항은 뎁스와 무관하게 성사
    expect(viaClause.fee).toBe(clause);
  });
});

describe('A2: 스와프 딜', () => {
  it('두 구단이 선수를 맞교환하면 소속이 정확히 뒤바뀐다', () => {
    const clubs = makeLeague(50);
    const a = clubs[0]!; const b = clubs[1]!;
    const playerA = a.players[a.players.length - 1]!;
    const playerB = b.players[b.players.length - 1]!;

    const r = swapPlayers(clubs, a.id, b.id, playerA.id, playerB.id);
    expect(r.ok).toBe(true);
    expect(r.playerAName).toBe(playerA.name);
    expect(r.playerBName).toBe(playerB.name);
    expect(a.players.some((p) => p.id === playerA.id)).toBe(false);
    expect(a.players.some((p) => p.id === playerB.id)).toBe(true);
    expect(b.players.some((p) => p.id === playerB.id)).toBe(false);
    expect(b.players.some((p) => p.id === playerA.id)).toBe(true);
  });

  it('양수 정산금은 A→B, 음수는 B→A로 이체된다', () => {
    const clubs = makeLeague(51);
    const a = clubs[0]!; const b = clubs[1]!;
    const playerA = a.players[a.players.length - 1]!;
    const playerB = b.players[b.players.length - 1]!;
    const aBefore = a.finance.balance; const bBefore = b.finance.balance;

    const r = swapPlayers(clubs, a.id, b.id, playerA.id, playerB.id, 5000);
    expect(r.ok).toBe(true);
    expect(a.finance.balance).toBe(aBefore - 5000);
    expect(b.finance.balance).toBe(bBefore + 5000);
  });

  it('같은 구단끼리는 맞교환할 수 없다', () => {
    const clubs = makeLeague(52);
    const a = clubs[0]!;
    const p1 = a.players[0]!; const p2 = a.players[1]!;
    const r = swapPlayers(clubs, a.id, a.id, p1.id, p2.id);
    expect(r.ok).toBe(false);
  });

  it('포지션 라인이 바닥나는 교환은 거절된다', () => {
    const clubs = makeLeague(53);
    const a = clubs[0]!; const b = clubs[1]!;
    const gk = a.players.find((p) => p.position === 'GK')!;
    // 다른 GK를 모두 제거해 뎁스를 바닥낸다.
    a.players = a.players.filter((p) => p.id === gk.id || p.position !== 'GK');
    const playerB = b.players[b.players.length - 1]!;
    const r = swapPlayers(clubs, a.id, b.id, gk.id, playerB.id);
    expect(r.ok).toBe(false);
  });

  it('임대 중인 선수는 맞교환 대상에서 제외된다', () => {
    const clubs = makeLeague(54);
    const a = clubs[0]!; const b = clubs[1]!; const c = clubs[2]!;
    const loanedPlayer = a.players[a.players.length - 1]!;
    loanPlayerOut(clubs, a.id, c.id, loanedPlayer.id, { seasons: 1, fee: 0, wageShareByParent: 0 });
    const playerB = b.players[b.players.length - 1]!;
    const r = swapPlayers(clubs, c.id, b.id, loanedPlayer.id, playerB.id);
    expect(r.ok).toBe(false);
  });

  it('자금이 부족하면 정산금이 걸린 교환은 거절된다', () => {
    const clubs = makeLeague(55);
    const a = clubs[0]!; const b = clubs[1]!;
    const playerA = a.players[a.players.length - 1]!;
    const playerB = b.players[b.players.length - 1]!;
    const r = swapPlayers(clubs, a.id, b.id, playerA.id, playerB.id, a.finance.balance + 1_000_000);
    expect(r.ok).toBe(false);
  });
});
