import { describe, it, expect } from 'vitest';
import { captainScore, rankCaptainCandidates } from '../src/captaincy.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Player } from '../src/types.js';

function makePlayers(n = 4): Player[] {
  const rng = new Rng(5);
  return generateClub(rng, 'c', 'C', 12).players.slice(0, n);
}

describe('신규 개선 항목 16: 주장 후보 추천 로직', () => {
  it('리더십 능력치가 높을수록 점수가 높다', () => {
    const [a, b] = makePlayers(2);
    a!.attributes.leadership = 10;
    b!.attributes.leadership = 18;
    expect(captainScore(b!)).toBeGreaterThan(captainScore(a!));
  });

  it('리더 특성 보유 선수는 같은 리더십이어도 점수가 더 높다', () => {
    const [a, b] = makePlayers(2);
    a!.attributes.leadership = 12; a!.traits = [];
    b!.attributes.leadership = 12; b!.traits = ['leader'];
    expect(captainScore(b!)).toBeGreaterThan(captainScore(a!));
  });

  it('다혈질 특성 보유 선수는 같은 리더십이어도 점수가 더 낮다', () => {
    const [a, b] = makePlayers(2);
    a!.attributes.leadership = 12; a!.traits = [];
    b!.attributes.leadership = 12; b!.traits = ['hothead'];
    expect(captainScore(b!)).toBeLessThan(captainScore(a!));
  });

  it('소속 시즌(로열티)이 길수록 점수가 소폭 오르되 상한이 있다', () => {
    const [a, b, c] = makePlayers(3);
    a!.attributes.leadership = 12; a!.seasonsAtClub = 0; a!.caps = 0;
    b!.attributes.leadership = 12; b!.seasonsAtClub = 3; b!.caps = 0;
    c!.attributes.leadership = 12; c!.seasonsAtClub = 100; c!.caps = 0; // 상한 확인용 극단치
    expect(captainScore(b!)).toBeGreaterThan(captainScore(a!));
    // 100시즌이든 3시즌이든 로열티 가산 상한(TENURE_BONUS_MAX=3)을 넘지 못해 동점이어야 한다.
    expect(captainScore(c!)).toBeCloseTo(a!.attributes.leadership + 3, 5);
  });

  it('국가대표 캡이 많을수록 점수가 소폭 오르되 상한이 있다', () => {
    const [a, b] = makePlayers(2);
    a!.attributes.leadership = 12; a!.caps = 0;
    b!.attributes.leadership = 12; b!.caps = 30;
    expect(captainScore(b!)).toBeGreaterThan(captainScore(a!));
  });

  it('rankCaptainCandidates는 점수 내림차순으로 정렬되고 isLeaderTrait/isHothead 플래그를 포함한다', () => {
    const [a, b, c] = makePlayers(3);
    a!.attributes.leadership = 8; a!.traits = [];
    b!.attributes.leadership = 15; b!.traits = ['leader'];
    c!.attributes.leadership = 15; c!.traits = ['hothead'];
    const ranked = rankCaptainCandidates([a!, b!, c!]);
    expect(ranked[0]!.playerId).toBe(b!.id);
    expect(ranked[0]!.isLeaderTrait).toBe(true);
    expect(ranked.find((r) => r.playerId === c!.id)!.isHothead).toBe(true);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.score).toBeGreaterThanOrEqual(ranked[i]!.score);
    }
  });
});
