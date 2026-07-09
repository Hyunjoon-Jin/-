import { describe, it, expect } from 'vitest';
import { startGame, advanceFullSeason } from '../src/game.js';

describe('고도화 Item34: 전 구단 상대 전적(H2H) 기록', () => {
  it('시즌을 진행하면 실제로 맞붙은 상대별로 승/무/패가 누적된다', () => {
    let g = startGame(2026, 'c0');
    g = advanceFullSeason(g);
    expect(g.headToHead).toBeDefined();
    const entries = Object.entries(g.headToHead!);
    expect(entries.length).toBeGreaterThan(0);
    for (const [, rec] of entries) {
      expect(rec.wins + rec.draws + rec.losses).toBeGreaterThan(0);
      expect(rec.lastMeeting.season).toBeGreaterThanOrEqual(1);
    }
  });

  it('같은 상대와 여러 시즌 맞붙으면 전적이 누적된다(리셋되지 않음)', () => {
    let g = startGame(2026, 'c0');
    g = advanceFullSeason(g);
    const after1: Record<string, { wins: number; draws: number; losses: number }> = { ...g.headToHead! };
    g = advanceFullSeason(g);
    const after2 = g.headToHead!;
    // 최소 한 상대는 두 시즌 다 만나 누적값이 늘어난다.
    let sawAccumulation = false;
    for (const oppId of Object.keys(after2)) {
      const before = after1[oppId];
      const now = after2[oppId]!;
      const beforeTotal = before ? before.wins + before.draws + before.losses : 0;
      const nowTotal = now.wins + now.draws + now.losses;
      if (before && nowTotal > beforeTotal) { sawAccumulation = true; break; }
    }
    expect(sawAccumulation).toBe(true);
  });

  it('동일 시드면 동일한 H2H 결과 (재현성)', () => {
    let a = startGame(2026, 'c0');
    a = advanceFullSeason(a);
    let b = startGame(2026, 'c0');
    b = advanceFullSeason(b);
    expect(a.headToHead).toEqual(b.headToHead);
  });

  it('라이벌과의 rivalRecord 합계와 headToHead[rivalClubId] 합계가 일치한다', () => {
    let g = startGame(2026, 'c0');
    for (let i = 0; i < 3; i++) g = advanceFullSeason(g);
    const rivalH2H = g.headToHead![g.rivalClubId];
    expect(rivalH2H).toBeDefined();
    const h2hTotal = rivalH2H!.wins + rivalH2H!.draws + rivalH2H!.losses;
    const rivalTotal = g.rivalRecord.wins + g.rivalRecord.draws + g.rivalRecord.losses;
    expect(h2hTotal).toBe(rivalTotal);
  });
});
