import { describe, it, expect } from 'vitest';
import { startGame, myClub, myTactic } from '../src/game.js';
import { swapPlayer } from '../src/tactics.js';

describe('tactics: swapPlayer', () => {
  it('범위 밖 slotIndex는 크래시 없이 전술을 그대로 반환한다', () => {
    const g = startGame(2026, 'c0');
    const tactic = myTactic(g);
    const anyPlayerId = myClub(g).players[0]!.id;
    expect(() => swapPlayer(tactic, tactic.lineup.length + 5, anyPlayerId)).not.toThrow();
    expect(() => swapPlayer(tactic, -1, anyPlayerId)).not.toThrow();
    expect(swapPlayer(tactic, tactic.lineup.length + 5, anyPlayerId)).toEqual(tactic);
    expect(swapPlayer(tactic, -1, anyPlayerId)).toEqual(tactic);
  });

  it('유효한 slotIndex는 정상적으로 교체된다', () => {
    const g = startGame(2026, 'c0');
    const tactic = myTactic(g);
    const bench = myClub(g).players.find((p) => !tactic.lineup.some((s) => s.playerId === p.id))!;
    const next = swapPlayer(tactic, 0, bench.id);
    expect(next.lineup[0]!.playerId).toBe(bench.id);
  });
});
