import { describe, it, expect } from 'vitest';
import { startGame, myClub, setAcademyFocus } from '../src/game.js';

describe('신규 개선 항목 13: 유스 아카데미 포지션 특화 슬롯 (앱 통합)', () => {
  it('특화 라인을 지정하면 club.finance.academyFocus에 반영된다', () => {
    const g0 = startGame(2026, 'c0');
    const g1 = setAcademyFocus(g0, 'ATT');
    expect(myClub(g1).finance.academyFocus).toBe('ATT');
  });

  it('undefined를 넘기면 특화가 해제된다', () => {
    const g0 = startGame(2026, 'c0');
    const g1 = setAcademyFocus(g0, 'DEF');
    expect(myClub(g1).finance.academyFocus).toBe('DEF');
    const g2 = setAcademyFocus(g1, undefined);
    expect(myClub(g2).finance.academyFocus).toBeUndefined();
  });
});
