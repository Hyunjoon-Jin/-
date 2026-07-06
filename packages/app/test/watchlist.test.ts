import { describe, it, expect } from 'vitest';
import {
  startGame, startSeason, toggleWatchlistAction, isWatchlisted, transferWatchlistEntries,
  advanceFullSeason, myClub,
} from '../src/game.js';
import { transferTargets } from '@soccer-tycoon/engine';

describe('신규 개선 항목 27: 이적 관심 목록 (앱 통합)', () => {
  it('타 구단 선수를 관심 목록에 추가/제거할 수 있다', () => {
    const g0 = startGame(2026, 'c0');
    const target = transferTargets(g0.clubs, g0.myClubId)[0]!;
    expect(isWatchlisted(g0, target.player.id)).toBe(false);

    const added = toggleWatchlistAction(g0, target.player.id);
    expect(added.ok).toBe(true);
    expect(isWatchlisted(added.state, target.player.id)).toBe(true);

    const removed = toggleWatchlistAction(added.state, target.player.id);
    expect(removed.ok).toBe(true);
    expect(isWatchlisted(removed.state, target.player.id)).toBe(false);
  });

  it('내 구단 소속 선수는 관심 목록에 추가할 수 없다', () => {
    const g0 = startGame(2027, 'c0');
    const myPlayer = myClub(g0).players[0]!;
    const outcome = toggleWatchlistAction(g0, myPlayer.id);
    expect(outcome.ok).toBe(false);
  });

  it('transferWatchlistEntries는 관심 목록에 올린 선수의 정보를 담아 반환한다', () => {
    const g0 = startGame(2028, 'c0');
    const target = transferTargets(g0.clubs, g0.myClubId)[0]!;
    const outcome = toggleWatchlistAction(g0, target.player.id);
    const entries = transferWatchlistEntries(outcome.state);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.playerId).toBe(target.player.id);
    expect(entries[0]!.clubId).toBe(target.clubId);
  });

  it('관심 목록은 시즌을 넘어 유지된다', () => {
    const g0 = startSeason(startGame(2029, 'c0'));
    const target = transferTargets(g0.clubs, g0.myClubId)[0]!;
    const outcome = toggleWatchlistAction(g0, target.player.id);
    const g1 = advanceFullSeason(outcome.state);
    expect(isWatchlisted(g1, target.player.id)).toBe(true);
  });

  it('관심 선수의 계약이 마지막 해로 접어들면 시즌 요약에 알림이 남는다', () => {
    let g = startSeason(startGame(2030, 'c0'));
    const target = transferTargets(g.clubs, g.myClubId)[0]!;
    const outcome = toggleWatchlistAction(g, target.player.id);
    g = outcome.state;
    // 실제 선수 객체를 계약 마지막 해 직전(2년)으로 맞춰 이번 시즌에 확실히 1년 이하로 접어들게 한다.
    const club = g.clubs.find((c) => c.id === target.clubId)!;
    const player = club.players.find((p) => p.id === target.player.id)!;
    player.contractYears = 2;

    const g1 = advanceFullSeason(g);
    const last = g1.history.at(-1)!;
    // 은퇴/이적 등으로 시장에서 사라지지 않았다면 알림이 남아야 한다.
    const stillOnMarket = transferTargets(g1.clubs, g1.myClubId).some((t) => t.player.id === target.player.id);
    if (stillOnMarket) {
      expect(last.watchlistContractAlerts?.some((a) => a.playerId === target.player.id)).toBe(true);
    }
  });
});
