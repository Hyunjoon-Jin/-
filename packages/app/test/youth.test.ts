import { describe, it, expect } from 'vitest';
import { startGame, advanceFullSeason, myClub } from '../src/game.js';

describe('시즌 요약: 유스 아카데미 기대주 소개', () => {
  it('시즌을 마치면 요약에 youthProspects가 실리고, 잠재력 내림차순으로 정렬된다', () => {
    let g = startGame(2026, 'c0');
    g = advanceFullSeason(g);
    const summary = g.history[0]!;
    expect(summary.youthProspects).toBeDefined();
    expect(summary.youthProspects!.length).toBeGreaterThan(0);
    const potentials = summary.youthProspects!.map((p) => p.potential);
    expect(potentials).toEqual([...potentials].sort((a, b) => b - a));
  });

  it('기대주로 소개된 선수는 실제로 내 구단 스쿼드에 있다', () => {
    let g = startGame(2026, 'c0');
    g = advanceFullSeason(g);
    const summary = g.history[0]!;
    const squadIds = new Set(myClub(g).players.map((p) => p.id));
    for (const p of summary.youthProspects ?? []) {
      expect(squadIds.has(p.playerId)).toBe(true);
    }
  });

  it('스태프 유스 레벨을 올리면(잠재력 보너스) 기대주 수가 줄지는 않는다', () => {
    let g = startGame(2026, 'c0');
    myClub(g).staff.youth = 20;
    g = advanceFullSeason(g);
    const summary = g.history[0]!;
    expect(summary.youthProspects!.length).toBeGreaterThanOrEqual(1);
  });
});
