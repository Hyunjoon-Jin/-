import { describe, it, expect } from 'vitest';
import { startGame, advanceFullSeason, divisionClubs } from '../src/game.js';
import { computeClubRecords } from '../src/records.js';

/**
 * 승격 플레이오프(D11) + 역대 기록집(D09) 회귀 테스트.
 * 예전엔 2부 상위 3팀이 곧바로 자동 승격됐고, 재임 전체를 스캔해 개인·구단
 * 기록을 뽑아주는 개념 자체가 없었다.
 */
describe('D11: 승격 플레이오프', () => {
  it('매 시즌 2부 3~6위 4개 구단이 플레이오프를 치르고 그중 한 팀이 승격한다', () => {
    let g = startGame(2026, 'c0');
    for (let i = 0; i < 3; i++) g = advanceFullSeason(g);
    for (const s of g.history) {
      expect(s.promotionPlayoff).toBeDefined();
      const pp = s.promotionPlayoff!;
      expect(pp.participants).toHaveLength(4);
      expect(pp.participants.map((p) => p.clubId)).toContain(pp.championId);
    }
  });

  it('플레이오프를 거쳐도 매 시즌 부별 인원(각 12명)이 유지된다', () => {
    let g = startGame(2026, 'c0');
    for (let i = 0; i < 3; i++) {
      g = advanceFullSeason(g);
      expect(divisionClubs(g, 0)).toHaveLength(12);
      expect(divisionClubs(g, 1)).toHaveLength(12);
    }
  });
});

describe('D09: 역대 기록집', () => {
  it('시즌이 없으면 모든 기록이 undefined다', () => {
    const g = startGame(2026, 'c0');
    const records = computeClubRecords(g);
    expect(Object.values(records).every((r) => r === undefined)).toBe(true);
  });

  it('시즌을 치르면 최고 순위·최다 승점 등 구단 기록이 채워진다', () => {
    let g = startGame(2026, 'c0');
    for (let i = 0; i < 3; i++) g = advanceFullSeason(g);
    const records = computeClubRecords(g);
    expect(records.bestFinish).toBeDefined();
    expect(records.bestFinish!.detail).toMatch(/\d+위/);
    expect(records.mostPointsSeason).toBeDefined();
  });

  it('여러 시즌 중 최고 기록만 남는다(더 나쁜 기록으로 덮어쓰지 않는다)', () => {
    let g = startGame(2026, 'c0');
    for (let i = 0; i < 5; i++) g = advanceFullSeason(g);
    const records = computeClubRecords(g);
    if (records.bestFinish) {
      const allPositions = g.history
        .map((s) => s.table.findIndex((r) => r.clubId === g.myClubId) + 1)
        .filter((p) => p > 0);
      expect(records.bestFinish.detail).toBe(`${Math.min(...allPositions)}위`);
    }
  });
});
