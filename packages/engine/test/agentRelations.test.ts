import { describe, it, expect } from 'vitest';
import {
  agentRelationsOf, agentRelationsTier, evaluateOffer, askingPrice, buyPlayerAt,
  AGENT_RELATIONS_MIN, AGENT_RELATIONS_MAX, AGENT_RELATIONS_DEFAULT,
} from '../src/transferActions.js';
import { generateClub } from '../src/generate.js';
import { ALL_ATTRS } from '../src/types.js';
import { Rng } from '../src/rng.js';
import type { Club, Attributes } from '../src/types.js';

function twoClubs(seed: number): { clubs: Club[]; myId: string } {
  const rng = new Rng(seed);
  const me = generateClub(rng, 'me', 'Me', 14);
  const other = generateClub(rng, 'ot', 'Other', 14);
  me.finance.transferBudget = 500_000_000;
  me.finance.balance = 500_000_000;
  return { clubs: [me, other], myId: 'me' };
}

function pickPlayer(other: Club) {
  return other.players[Math.floor(other.players.length / 2)]!;
}

function setFlatCA(attrs: Attributes, value: number): void {
  for (const k of ALL_ATTRS) attrs[k] = value;
}

describe('신규 개선 항목 6: 에이전트 관계 지수', () => {
  it('관계 지수가 없으면(구버전 세이브) 중립값(AGENT_RELATIONS_DEFAULT)으로 취급한다', () => {
    const { clubs } = twoClubs(1);
    expect(agentRelationsOf(clubs[0]!)).toBe(AGENT_RELATIONS_DEFAULT);
  });

  it('등급 분류가 경계값 기준으로 올바르게 나뉜다', () => {
    expect(agentRelationsTier(90)).toBe('excellent');
    expect(agentRelationsTier(70)).toBe('good');
    expect(agentRelationsTier(50)).toBe('neutral');
    expect(agentRelationsTier(30)).toBe('poor');
    expect(agentRelationsTier(10)).toBe('hostile');
  });

  it('관계가 좋으면 같은 제안이 중립일 때보다 유리하게(거절→역제안 이상) 처리된다', () => {
    const { clubs: cNeutral } = twoClubs(10);
    const { clubs: cGood } = twoClubs(10);
    const modNeutral = pickPlayer(cNeutral[1]!);
    const modGood = pickPlayer(cGood[1]!);
    setFlatCA(modNeutral.attributes, 14); modNeutral.age = 25; modNeutral.traits = [];
    setFlatCA(modGood.attributes, 14); modGood.age = 25; modGood.traits = [];
    cGood[0]!.agentRelations = 95;

    const ask = askingPrice(cNeutral[1]!, modNeutral);
    // 보통 하한(0.82) 바로 아래로 제안 — 중립이면 거절, 관계가 아주 좋으면 하한이 내려가 역제안 이상.
    const offer = Math.round(ask * 0.81);
    const evNeutral = evaluateOffer(cNeutral, 'me', modNeutral.id, offer);
    const evGood = evaluateOffer(cGood, 'me', modGood.id, offer);
    expect(evNeutral.outcome).toBe('rejected');
    expect(evGood.outcome).not.toBe('rejected');
  });

  it('관계가 나쁘면 같은 제안이 중립일 때보다 불리하게(역제안→거절) 처리된다', () => {
    const { clubs: cNeutral } = twoClubs(11);
    const { clubs: cBad } = twoClubs(11);
    const modNeutral = pickPlayer(cNeutral[1]!);
    const modBad = pickPlayer(cBad[1]!);
    setFlatCA(modNeutral.attributes, 14); modNeutral.age = 25; modNeutral.traits = [];
    setFlatCA(modBad.attributes, 14); modBad.age = 25; modBad.traits = [];
    cBad[0]!.agentRelations = 5;

    const ask = askingPrice(cNeutral[1]!, modNeutral);
    // 보통 하한(0.82) 바로 위로 제안 — 중립이면 역제안, 관계가 아주 나쁘면 하한이 올라가 거절.
    const offer = Math.round(ask * 0.83);
    const evNeutral = evaluateOffer(cNeutral, 'me', modNeutral.id, offer);
    const evBad = evaluateOffer(cBad, 'me', modBad.id, offer);
    expect(evNeutral.outcome).toBe('countered');
    expect(evBad.outcome).toBe('rejected');
  });

  it('buyPlayerAt으로 영입에 성공하면 관계 지수가 소폭 오른다(100 상한)', () => {
    const { clubs } = twoClubs(12);
    const other = clubs[1]!;
    const player = pickPlayer(other);
    clubs[0]!.agentRelations = 98;

    const r = buyPlayerAt(clubs, 'me', player.id, askingPrice(other, player));
    expect(r.ok).toBe(true);
    expect(agentRelationsOf(clubs[0]!)).toBe(AGENT_RELATIONS_MAX);
  });

  it('관계 지수는 항상 0~100 범위로 clamp된다', () => {
    const { clubs } = twoClubs(13);
    clubs[0]!.agentRelations = -50;
    expect(agentRelationsOf(clubs[0]!)).toBe(AGENT_RELATIONS_MIN);
    clubs[0]!.agentRelations = 500;
    expect(agentRelationsOf(clubs[0]!)).toBe(AGENT_RELATIONS_MAX);
  });
});
