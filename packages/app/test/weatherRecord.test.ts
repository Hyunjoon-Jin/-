import { describe, it, expect } from 'vitest';
import { startGame, advanceFullSeason } from '../src/game.js';

describe('고도화 Item40: 날씨별 전적 (앱 통합)', () => {
  it('시즌 종료 시 내 구단의 날씨별 전적이 시즌 요약에 실리고, 합계가 리그 경기 수와 일치한다', () => {
    const g = advanceFullSeason(startGame(2026, 'c0'));
    const summary = g.history.at(-1)!;
    expect(summary.weatherRecord).toBeDefined();
    expect(summary.weatherRecord!.length).toBeGreaterThan(0);

    const totalFromWeather = summary.weatherRecord!.reduce((sum, row) => sum + row.wins + row.draws + row.losses, 0);
    const myRow = summary.table.find((r) => r.clubId === g.myClubId)!;
    expect(totalFromWeather).toBe(myRow.played);
  });
});
