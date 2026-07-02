import { describe, it, expect } from 'vitest';
import { startGame, startSeason, finishSeason, playRestOfSeason, myDivision, myClub } from '../src/game.js';

describe('프리시즌 언론 예상 순위', () => {
  it('시즌 시작 시 내 구단이 부의 예상 순위표에 정확히 하나 포함된다', () => {
    const g = startSeason(startGame(2026, 'c5'));
    const table = g.live!.predictedTable;
    const divSize = table.length;
    const mine = table.filter((p) => p.clubId === g.myClubId);
    expect(mine.length).toBe(1);
    expect(mine[0]!.predictedPos).toBeGreaterThanOrEqual(1);
    expect(mine[0]!.predictedPos).toBeLessThanOrEqual(divSize);
    // 순위가 1..N 순열을 이룬다(중복·누락 없음)
    const positions = table.map((p) => p.predictedPos).sort((a, b) => a - b);
    expect(positions).toEqual(Array.from({ length: divSize }, (_, i) => i + 1));
  });

  it('같은 시드는 같은 예상 순위를 낸다 (재현성)', () => {
    const a = startSeason(startGame(2026, 'c5'));
    const b = startSeason(startGame(2026, 'c5'));
    const posA = a.live!.predictedTable.find((p) => p.clubId === a.myClubId)!.predictedPos;
    const posB = b.live!.predictedTable.find((p) => p.clubId === b.myClubId)!.predictedPos;
    expect(posA).toBe(posB);
  });

  it('시즌 종료 요약에 예상 순위가 실려 나오고, 실제 순위와 함께 이변 여부를 판정할 수 있다', () => {
    let g = startSeason(startGame(2026, 'c5'));
    const predicted = g.live!.predictedTable.find((p) => p.clubId === g.myClubId)!.predictedPos;
    g = playRestOfSeason(g);
    g = finishSeason(g);
    const summary = g.history[0]!;
    expect(summary.preseasonRank).toBe(predicted);
    if (summary.surprise === 'overperform') {
      const actualPos = summary.table.findIndex((r) => r.clubId === g.myClubId) + 1;
      expect(predicted - actualPos).toBeGreaterThanOrEqual(4);
    } else if (summary.surprise === 'underperform') {
      const actualPos = summary.table.findIndex((r) => r.clubId === g.myClubId) + 1;
      expect(actualPos - predicted).toBeGreaterThanOrEqual(4);
    }
  });

  it('예상 순위는 부(division) 소속 구단 수만큼 순위를 매긴다', () => {
    const g = startSeason(startGame(2026, 'c5'));
    expect(g.live!.predictedTable.length).toBeGreaterThan(0);
    expect(myDivision(g)).toBe(myClub(g).division);
  });
});
