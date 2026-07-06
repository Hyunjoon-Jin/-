import { describe, it, expect } from 'vitest';
import {
  startGame, advanceFullSeason, setTrainingPosition, myClub, lastSummary, playerTimeline,
} from '../src/game.js';
import type { Position } from '@soccer-tycoon/engine';

describe('고도화 Item13: 포지션 전환 마일스톤 (앱 통합)', () => {
  it('전환 훈련 지정 선수가 숙련도 임계값을 넘으면 시즌 요약과 커리어 타임라인에 반영된다', () => {
    let g = startGame(2026, 'c0');
    const p = myClub(g).players.find((pl) => pl.position !== 'GK')!;
    const target: Position = p.position === 'DC' ? 'ST' : 'DC';
    p.familiarity[target] = 0.28; // 30% 문턱 바로 아래
    g = setTrainingPosition(g, p.id, target);

    g = advanceFullSeason(g);
    const summary = lastSummary(g);
    const hit = summary?.milestones?.find((m) => (
      m.playerId === p.id && m.kind === 'positionMastery' && m.position === target
    ));
    expect(hit).toBeDefined();
    expect(hit!.value).toBe(30);

    const timeline = playerTimeline(g, p.id);
    const entry = timeline.find((e) => e.kind === 'positionMilestone' && e.position === target);
    expect(entry).toBeDefined();
  });

  it('전환 훈련을 지정하지 않으면 포지션 마일스톤이 시즌 요약에 나타나지 않는다', () => {
    let g = startGame(2027, 'c0');
    for (const pl of myClub(g).players) pl.trainingPosition = undefined;
    g = advanceFullSeason(g);
    const summary = lastSummary(g);
    expect(summary?.milestones?.some((m) => m.kind === 'positionMastery')).toBe(false);
  });
});
