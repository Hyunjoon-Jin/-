import { describe, it, expect } from 'vitest';
import {
  startGame, startSeason, watchSetup, watchCupSetup, playRound,
} from '../src/game.js';

describe('컵 결승 관전 표시', () => {
  it('리그 경기 관전 셋업은 cupRoundName이 없다', () => {
    let g = startSeason(startGame(2026, 'c0'));
    g = playRound(g); // 라운드 하나를 커밋해 watchSetup이 다음 라운드를 가리키게 함
    const ws = watchSetup(g);
    if (ws) expect(ws.cupRoundName).toBeUndefined();
  });

  it('생존자가 2팀(내 구단 포함)으로 좁혀지면 컵 관전 셋업의 cupRoundName이 "결승"이다', () => {
    let g = startSeason(startGame(2026, 'c0'));
    const mine = g.myClubId;
    g = {
      ...g,
      cup: {
        ...g.cup!,
        rounds: [{
          name: '4강',
          ties: [
            { homeId: mine, awayId: 'c9', homeScore: 2, awayScore: 1, penalties: false, winnerId: mine },
            { homeId: 'c3', awayId: 'c7', homeScore: 1, awayScore: 0, penalties: false, winnerId: 'c3' },
          ],
        }],
      },
    };
    const ws = watchCupSetup(g);
    expect(ws).not.toBeNull();
    expect(ws!.cupRoundName).toBe('결승');
  });

  it('생존자가 4팀(준결승 단계)이면 cupRoundName은 "결승"이 아니다', () => {
    let g = startSeason(startGame(2026, 'c0'));
    const mine = g.myClubId;
    g = {
      ...g,
      cup: {
        ...g.cup!,
        rounds: [{
          name: '8강',
          ties: [
            { homeId: mine, awayId: 'c9', homeScore: 2, awayScore: 1, penalties: false, winnerId: mine },
            { homeId: 'c3', awayId: 'c7', homeScore: 1, awayScore: 0, penalties: false, winnerId: 'c3' },
            { homeId: 'c2', awayId: 'c8', homeScore: 1, awayScore: 1, penalties: true, winnerId: 'c2' },
            { homeId: 'c4', awayId: 'c6', homeScore: 0, awayScore: 0, penalties: true, winnerId: 'c4' },
          ],
        }],
      },
    };
    const ws = watchCupSetup(g);
    expect(ws).not.toBeNull();
    expect(ws!.cupRoundName).not.toBe('결승');
  });
});
