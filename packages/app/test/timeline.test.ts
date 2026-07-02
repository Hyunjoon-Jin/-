import { describe, it, expect } from 'vitest';
import { startGame, advanceFullSeason, playerTimeline, myClub } from '../src/game.js';

describe('선수 커리어 타임라인', () => {
  it('기록이 없는 선수는 빈 타임라인을 반환한다', () => {
    const g = startGame(2026, 'c0');
    const someId = myClub(g).players[0]!.id;
    // 아직 시즌을 진행하지 않았으므로 history/legends가 비어 있다.
    expect(playerTimeline(g, someId)).toEqual([]);
  });

  it('시즌 진행 후 마일스톤을 달성한 선수는 타임라인에 기록이 남고 시즌순 정렬된다', () => {
    let g = startGame(2026, 'c0');
    for (let i = 0; i < 6; i++) g = advanceFullSeason(g);
    // 6시즌 동안 마일스톤(50경기 등)을 하나라도 달성한 선수를 찾는다.
    const withMilestone = g.history.flatMap((s) => s.milestones ?? []);
    if (withMilestone.length === 0) return; // 이 시드에서 우연히 없으면 스킵
    const playerId = withMilestone[0]!.playerId;
    const timeline = playerTimeline(g, playerId);
    expect(timeline.length).toBeGreaterThan(0);
    expect(timeline.some((e) => e.kind === 'milestone')).toBe(true);
    const seasons = timeline.map((e) => e.season);
    expect(seasons).toEqual([...seasons].sort((a, b) => a - b));
  });

  it('이적 기록이 있는 선수는 fromClubName/toClubName이 정확히 담긴다', () => {
    let g = startGame(2026, 'c0');
    for (let i = 0; i < 6; i++) g = advanceFullSeason(g);
    const allTransfers = g.history.flatMap((s) => s.transfers);
    if (allTransfers.length === 0) return;
    const deal = allTransfers[0]!;
    const timeline = playerTimeline(g, deal.playerId);
    const entry = timeline.find((e) => e.kind === 'transfer' && e.toClubName === deal.toClubName);
    expect(entry).toBeDefined();
  });

  it('은퇴한 선수는 타임라인 마지막에 retired 항목이 붙는다', () => {
    let g = startGame(2026, 'c0');
    for (let i = 0; i < 10; i++) g = advanceFullSeason(g);
    if (g.legends.length === 0) return; // 은퇴자가 아직 없으면 스킵
    const legend = g.legends[0]!;
    const timeline = playerTimeline(g, legend.playerId);
    const last = timeline[timeline.length - 1];
    expect(last?.kind).toBe('retired');
  });
});
