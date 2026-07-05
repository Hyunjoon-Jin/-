import { describe, it, expect } from 'vitest';
import { startGame, myClub, thinSquadLines, LINE_DEPTH_RECOMMENDED } from '../src/game.js';

describe('A5: 스쿼드 뎁스 경고', () => {
  it('갓 생성된 스쿼드는 대체로 뎁스가 충분해 경고가 없다', () => {
    const g = startGame(2026, 'c0');
    expect(thinSquadLines(g)).toEqual([]);
  });

  it('특정 라인 선수를 대거 방출하면 그 라인이 뎁스 부족으로 잡힌다', () => {
    const g = startGame(2027, 'c0');
    const club = myClub(g);
    // ATT 라인만 1명만 남기고 모두 제거(권장 3명 미만으로 만든다).
    const attPositions = new Set(['ST', 'AMC', 'AML', 'AMR']);
    let kept = false;
    club.players = club.players.filter((p) => {
      if (!attPositions.has(p.position)) return true;
      if (!kept) { kept = true; return true; }
      return false;
    });
    const thin = thinSquadLines(g);
    expect(thin.some((t) => t.line === 'ATT')).toBe(true);
    const attEntry = thin.find((t) => t.line === 'ATT')!;
    expect(attEntry.count).toBeLessThan(LINE_DEPTH_RECOMMENDED.ATT);
  });
});
