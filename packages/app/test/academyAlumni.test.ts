import { describe, it, expect } from 'vitest';
import { startGame, advanceFullSeason, myClub } from '../src/game.js';
import type { SeasonSummary } from '@soccer-tycoon/engine';

describe('신규 개선 항목 18: 유스 졸업생 동문 네트워크 (앱 통합)', () => {
  it('과거 우리 리저브에서 승격했던 선수가 지금 다른 구단에 있으면 동문 소식에 실린다', () => {
    const g0 = startGame(2026, 'c0');
    const rival = g0.clubs.find((c) => c.id !== g0.myClubId)!;
    const grad = rival.players[0]!;
    g0.history = [{
      reservePromotions: [{
        playerId: grad.id, name: grad.name, position: grad.position,
        clubId: g0.myClubId, clubName: myClub(g0).name,
      }],
    } as unknown as SeasonSummary];

    const g1 = advanceFullSeason(g0);
    const summary = g1.history.at(-1)!;
    const entry = summary.academyAlumni?.find((a) => a.playerId === grad.id);
    expect(entry).toBeDefined();
    expect(entry!.clubId).not.toBe(g1.myClubId);
    expect(entry!.seasonApps).toBeGreaterThanOrEqual(0);
  });

  it('과거 승격 기록이 없으면 동문 소식이 비어 있다', () => {
    const g0 = startGame(2027, 'c0');
    const g1 = advanceFullSeason(g0);
    const summary = g1.history.at(-1)!;
    expect(summary.academyAlumni ?? []).toEqual([]);
  });

  it('승격했지만 여전히 내 구단에 있는 선수는 동문 소식에 실리지 않는다', () => {
    const g0 = startGame(2028, 'c0');
    const mine = myClub(g0).players[0]!;
    g0.history = [{
      reservePromotions: [{
        playerId: mine.id, name: mine.name, position: mine.position,
        clubId: g0.myClubId, clubName: myClub(g0).name,
      }],
    } as unknown as SeasonSummary];

    const g1 = advanceFullSeason(g0);
    const summary = g1.history.at(-1)!;
    expect(summary.academyAlumni?.some((a) => a.playerId === mine.id)).toBeFalsy();
  });
});
