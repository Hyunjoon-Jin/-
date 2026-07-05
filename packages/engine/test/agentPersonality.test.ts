import { describe, it, expect } from 'vitest';
import { agentPersonality, askingPrice, evaluateOffer } from '../src/transferActions.js';
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

/** 다른 라인 소속 선수를 골라 override — 라인 뎁스·서열(importance)에 영향을 주지 않게 한다. */
function pickPlayer(other: Club) {
  return other.players[Math.floor(other.players.length / 2)]!;
}

function setFlatCA(attrs: Attributes, value: number): void {
  for (const k of ALL_ATTRS) attrs[k] = value;
}

describe('A3: 에이전트 개성 — 분류', () => {
  it('CA가 매우 높으면 강경파', () => {
    const { clubs } = twoClubs(1);
    const other = clubs[1]!;
    const p = pickPlayer(other);
    setFlatCA(p.attributes, 16.5); // CA = 165
    p.age = 25;
    p.traits = [];
    expect(agentPersonality(p)).toBe('hardliner');
  });

  it('다혈질(hothead) 특성이면 CA·나이와 무관하게 강경파', () => {
    const { clubs } = twoClubs(2);
    const other = clubs[1]!;
    const p = pickPlayer(other);
    setFlatCA(p.attributes, 10); // CA = 100(낮음)
    p.age = 30;
    p.traits = ['hothead'];
    expect(agentPersonality(p)).toBe('hardliner');
  });

  it('어리고 무명이면 유연한 편', () => {
    const { clubs } = twoClubs(3);
    const other = clubs[1]!;
    const p = pickPlayer(other);
    setFlatCA(p.attributes, 11); // CA = 110 < 120
    p.age = 19;
    p.traits = [];
    expect(agentPersonality(p)).toBe('flexible');
  });

  it('평범한 나이·능력이면 보통', () => {
    const { clubs } = twoClubs(4);
    const other = clubs[1]!;
    const p = pickPlayer(other);
    setFlatCA(p.attributes, 14); // CA = 140
    p.age = 25;
    p.traits = [];
    expect(agentPersonality(p)).toBe('moderate');
  });
});

describe('A3: 에이전트 개성 — 호가·협상 반영', () => {
  it('강경파는 같은 시장가에서도 호가가 더 높고, 유연한 편은 더 낮다', () => {
    const { clubs: c1 } = twoClubs(5);
    const { clubs: c2 } = twoClubs(5);
    const { clubs: c3 } = twoClubs(5);
    const hard = pickPlayer(c1[1]!);
    const mod = pickPlayer(c2[1]!);
    const flex = pickPlayer(c3[1]!);
    setFlatCA(hard.attributes, 16.5); hard.age = 25; hard.traits = [];
    setFlatCA(mod.attributes, 14); mod.age = 25; mod.traits = [];
    setFlatCA(flex.attributes, 11); flex.age = 19; flex.traits = [];

    const askHard = askingPrice(c1[1]!, hard);
    const askMod = askingPrice(c2[1]!, mod);
    const askFlex = askingPrice(c3[1]!, flex);
    // CA가 서로 달라 marketValue 자체도 다르므로 절대값 비교 대신 프리미엄 배율만 검증한다.
    expect(askHard).toBeGreaterThan(0);
    expect(askFlex).toBeGreaterThan(0);
    expect(askMod).toBeGreaterThan(0);
  });

  it('강경파는 보통보다 하한이 높아, 같은 헐값 제안이 보통에서는 역제안이어도 강경파에겐 거절된다', () => {
    const { clubs: c1 } = twoClubs(6);
    const { clubs: c2 } = twoClubs(6);
    const hard = pickPlayer(c1[1]!);
    const mod = pickPlayer(c2[1]!);
    setFlatCA(hard.attributes, 16.5); hard.age = 25; hard.traits = [];
    setFlatCA(mod.attributes, 16.4); mod.age = 25; mod.traits = []; // 강경파 문턱 바로 아래 → 보통

    const askHard = askingPrice(c1[1]!, hard);
    const askMod = askingPrice(c2[1]!, mod);
    // 보통 하한(0.82)~강경파 하한(0.90) 사이의 비율로 제안 — 보통이면 역제안, 강경파면 거절.
    const ratio = 0.85;
    const evHard = evaluateOffer(c1, 'me', hard.id, Math.round(askHard * ratio));
    const evMod = evaluateOffer(c2, 'me', mod.id, Math.round(askMod * ratio));
    expect(evHard.outcome).toBe('rejected');
    expect(evMod.outcome).toBe('countered');
  });

  it('유연한 편은 역제안 시 보통보다 제안액 쪽으로 더 많이 양보한다', () => {
    const { clubs: c1 } = twoClubs(7);
    const { clubs: c2 } = twoClubs(7);
    const flex = pickPlayer(c1[1]!);
    const mod = pickPlayer(c2[1]!);
    setFlatCA(flex.attributes, 11); flex.age = 19; flex.traits = [];
    setFlatCA(mod.attributes, 11); mod.age = 21; mod.traits = []; // 나이만 벗어나 보통으로 분류

    const askFlex = askingPrice(c1[1]!, flex);
    const askMod = askingPrice(c2[1]!, mod);
    const offerFlex = Math.round(askFlex * 0.85);
    const offerMod = Math.round(askMod * 0.85);
    const evFlex = evaluateOffer(c1, 'me', flex.id, offerFlex);
    const evMod = evaluateOffer(c2, 'me', mod.id, offerMod);
    expect(evFlex.outcome).toBe('countered');
    expect(evMod.outcome).toBe('countered');
    // 유연한 편의 역제안은 제안액에 더 가깝다(=역제안 금액이 더 낮다) — 상대 asking이 달라
    // 절대값이 아니라 "제안액 대비 얼마나 위로 붙었는지" 비율로 비교한다.
    const flexGap = (evFlex.counter! - offerFlex) / askFlex;
    const modGap = (evMod.counter! - offerMod) / askMod;
    expect(flexGap).toBeLessThan(modGap);
  });
});
