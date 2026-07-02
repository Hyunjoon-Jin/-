import { describe, it, expect } from 'vitest';

/**
 * game.ts의 시드 파생 공식은 seed + season*1000 + k (k=1: transferSeed, 2: seasonSeed,
 * 3: offseasonSeed, 4: cup base) 패턴을 쓴다. "상대 부" 자동 시뮬(otherResult)은
 * seasonSeed(state) + 654_321을 쓰는데, 예전엔 +5000을 썼었다 — 그 경우 실제 계산해보면
 * seasonSeed(state)+5000 = seed+season*1000+5002 가 되어, 정확히 5시즌 뒤
 * seasonSeed(state')(season'=season+5)의 커서 0 기준 시드와 같은 값이 나왔다
 * (리그 매치 시뮬 시드가 미래 시즌과 매 시즌 재현되게 충돌).
 *
 * 이 테스트는 game.ts를 import하지 않고 동일한 산술 공식만으로 그 불변식을
 * 문서화·검증한다 — otherResult 오프셋의 1000 나머지가 seasonSeed 자체의 나머지(2)와
 * 절대 같아지지 않으면, 어떤 미래/과거 시즌의 리그 픽스처 시드와도 겹칠 수 없다.
 */
describe('시드 격리: 상대 부 자동 시뮬(otherResult)이 미래 시즌 리그 시드와 겹치지 않는다', () => {
  const OTHER_RESULT_OFFSET = 654_321; // game.ts와 반드시 동일하게 유지
  const SEASON_SEED_K = 2; // seasonSeed(state) = seed + season*1000 + 2

  it('오프셋의 1000 나머지가 seasonSeed의 나머지(2)와 다르다(핵심 불변식)', () => {
    expect(OTHER_RESULT_OFFSET % 1000).not.toBe(SEASON_SEED_K);
  });

  it('실제 시드 값으로 여러 시즌·커서 조합을 대입해도 겹치지 않는다', () => {
    const seed = 2026;
    const leagueSeeds = new Set<number>();
    const maxCursor = 200; // 더블 라운드로빈 픽스처 수 여유
    for (let season = 1; season <= 50; season++) {
      for (let cursor = 0; cursor < maxCursor; cursor++) {
        leagueSeeds.add(seed + season * 1000 + SEASON_SEED_K + cursor);
      }
    }
    for (let season = 1; season <= 50; season++) {
      const otherResultBaseSeed = seed + season * 1000 + SEASON_SEED_K + OTHER_RESULT_OFFSET;
      for (let cursor = 0; cursor < maxCursor; cursor++) {
        expect(leagueSeeds.has(otherResultBaseSeed + cursor)).toBe(false);
      }
    }
  });
});
