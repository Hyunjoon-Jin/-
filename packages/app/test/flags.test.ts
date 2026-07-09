import { describe, it, expect } from 'vitest';
import { flagFor } from '../src/flags.js';
import { academyNationPool } from '@soccer-tycoon/engine';

describe('고도화 Item12: 아카데미 유스풀 국가 확장 (앱 통합)', () => {
  it('확장된 아카데미 국적 풀(20개국) 전원에 대해 국기 이모지가 존재한다', () => {
    const fullPool = academyNationPool(20);
    expect(fullPool.length).toBeGreaterThan(10);
    for (const nation of fullPool) {
      expect(flagFor(nation)).not.toBe('');
    }
  });

  it('알 수 없는 국적 코드는 빈 문자열을 반환한다', () => {
    expect(flagFor('XXX')).toBe('');
  });
});
