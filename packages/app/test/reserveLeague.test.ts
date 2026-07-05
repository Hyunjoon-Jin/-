import { describe, it, expect } from 'vitest';
import { startGame, advanceFullSeason, myClub } from '../src/game.js';
import {
  MIN_RESERVE_SQUAD, generateYouthPlayer, FORMATION_433, Rng,
} from '@soccer-tycoon/engine';

describe('신규 개선 항목 14: 리저브팀 자체 소규모 리그(가상 매치) (앱 통합)', () => {
  it('구단 리저브가 하나도 없는(게임 시작 직후) 상태로 시즌을 마치면 reserveLeagueTable이 없다', () => {
    const g0 = startGame(2026, 'c0');
    const g1 = advanceFullSeason(g0);
    expect(g1.history.at(-1)?.reserveLeagueTable).toBeUndefined();
  });

  it('전 구단이 참가 자격(MIN_RESERVE_SQUAD)을 채우면 시즌 종료 후 내 구단이 포함된 순위표가 실린다', () => {
    const g0 = startGame(2026, 'c0');
    const rng = new Rng(1);
    for (const club of g0.clubs) {
      club.reserves = Array.from({ length: MIN_RESERVE_SQUAD }, (_, i) => (
        generateYouthPlayer(rng, FORMATION_433[i % FORMATION_433.length]!, 12)
      ));
    }
    const g1 = advanceFullSeason(g0);
    const table = g1.history.at(-1)?.reserveLeagueTable;
    expect(table).toBeDefined();
    expect(table!.length).toBe(g0.clubs.length);
    expect(table!.some((r) => r.clubId === myClub(g1).id)).toBe(true);
  });
});
