import { describe, it, expect } from 'vitest';
import { revealPotential } from '../src/game.js';

describe('revealPotential: 스카우팅 레벨별 잠재력(PA) 공개', () => {
  it('스카우팅 레벨이 낮으면(<8) 완전히 미상(?)', () => {
    expect(revealPotential(1, 150)).toBe('?');
    expect(revealPotential(7, 150)).toBe('?');
  });

  it('스카우팅 레벨 8~14는 범위(밴드)로 공개되고 실제 값을 포함한다', () => {
    const range = revealPotential(10, 150);
    expect(range).toMatch(/^\d+~\d+$/);
    const [lo, hi] = range.split('~').map(Number);
    expect(lo).toBeLessThanOrEqual(150);
    expect(hi).toBeGreaterThanOrEqual(150);
  });

  it('스카우팅 레벨 15 이상은 정확한 수치를 그대로 공개', () => {
    expect(revealPotential(15, 150)).toBe('150');
    expect(revealPotential(20, 87)).toBe('87');
  });
});
