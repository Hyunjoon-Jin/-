import { describe, it, expect } from 'vitest';
import { startGame, startSeason } from '../src/game.js';
import { currentAbility } from '@soccer-tycoon/engine';

describe('컵 우승 후보 예측', () => {
  it('시즌 시작 시 참가 전 구단(24개) 수만큼 순위가 매겨져 저장된다', () => {
    const g = startSeason(startGame(2026, 'c0'));
    const favorites = g.live!.cupFavorites;
    expect(favorites.length).toBe(g.clubs.length);
    const positions = favorites.map((f) => f.predictedPos);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(positions[0]).toBe(1);
  });

  it('내 구단도 예측 목록에 정확히 한 번 포함된다', () => {
    const g = startSeason(startGame(2026, 'c0'));
    const mine = g.live!.cupFavorites.filter((f) => f.clubId === g.myClubId);
    expect(mine.length).toBe(1);
  });

  it('전력이 강한 구단일수록 예상 순위가 앞선다(스쿼드 CA 상위 구단 검증)', () => {
    const g = startSeason(startGame(2026, 'c0'));
    const favorites = g.live!.cupFavorites;
    // 예측은 전술 XI 평균 CA 내림차순 정렬 결과이므로, 상위 절반의 평균 CA가
    // 하위 절반보다 낮을 수 없다(동일할 수는 있어도 역전되진 않는다).
    const top = favorites.slice(0, favorites.length / 2);
    const bottom = favorites.slice(favorites.length / 2);
    const avgCA = (ids: typeof top) => ids
      .map((f) => g.clubs.find((c) => c.id === f.clubId)!)
      .reduce((s, c) => s + c.players.reduce((a, p) => a + currentAbility(p), 0) / c.players.length, 0) / ids.length;
    expect(avgCA(top)).toBeGreaterThanOrEqual(avgCA(bottom));
  });
});
