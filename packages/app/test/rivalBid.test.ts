import { describe, it, expect } from 'vitest';
import { startGame, myClub, negotiate, resolveRivalSnipe } from '../src/game.js';

/** transferActions.ts의 hashSeed와 동일한 결정론적 32비트 해시(테스트 전용 사본). */
function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** transferActions.ts와 동일한 공식으로 라운드별 경쟁 입찰 발동 확률을 계산한다(테스트 전용 사본). */
function rivalChanceAt(round: number): number {
  const RIVAL_BID_MIN_ROUND = 1;
  const RIVAL_BID_BASE_CHANCE = 0.12;
  const RIVAL_BID_PER_ROUND = 0.06;
  const RIVAL_BID_MAX_CHANCE = 0.35;
  return Math.min(RIVAL_BID_MAX_CHANCE, RIVAL_BID_BASE_CHANCE + (round - RIVAL_BID_MIN_ROUND) * RIVAL_BID_PER_ROUND);
}

describe('신규 개선 항목 9: 경쟁 입찰(라이벌 클럽 개입, 앱 통합)', () => {
  it('경쟁 입찰로 선수를 놓치면 resolveRivalSnipe로 실제 이적이 확정된다', () => {
    const g = startGame(2026, 'c0');
    const round = 3;
    const chance = rivalChanceAt(round);
    let target: { playerId: string; clubId: string } | undefined;
    for (const club of g.clubs) {
      if (club.id === g.myClubId) continue;
      for (const player of club.players) {
        const roll = hashSeed(`${player.id}:${round}:rival`) / 0xFFFFFFFF;
        if (roll < chance) { target = { playerId: player.id, clubId: club.id }; break; }
      }
      if (target) break;
    }
    expect(target).toBeDefined();

    const ev = negotiate(g, target!.playerId, 1, round);
    expect(ev.outcome).toBe('lostToRival');
    expect(ev.rivalClubId).toBeDefined();
    expect(ev.rivalBid).toBeGreaterThan(0);

    const outcome = resolveRivalSnipe(g, target!.playerId, ev.rivalClubId!, ev.rivalBid!);
    expect(outcome.ok).toBe(true);
    const rival = outcome.state.clubs.find((c) => c.id === ev.rivalClubId)!;
    expect(rival.players.some((p) => p.id === target!.playerId)).toBe(true);
    expect(myClub(outcome.state).players.some((p) => p.id === target!.playerId)).toBe(false);
  });

  it('시즌 진행 중에는 사용할 수 없다', () => {
    const g = startGame(2027, 'c0');
    const otherClub = g.clubs.find((c) => c.id !== g.myClubId)!;
    const player = otherClub.players[0]!;
    const liveState = { ...g, live: true };
    const outcome = resolveRivalSnipe(liveState, player.id, otherClub.id, 1000);
    expect(outcome.ok).toBe(false);
  });
});
