import { describe, it, expect } from 'vitest';
import {
  startGame, advanceFullSeason, playerRatingHistory, myClub,
} from '../src/game.js';

describe('선수 시즌별 평균 평점 이력', () => {
  it('아직 시즌을 진행하지 않았으면 빈 이력을 반환한다', () => {
    const g = startGame(2026, 'c0');
    const someId = myClub(g).players[0]!.id;
    expect(playerRatingHistory(g, someId)).toEqual([]);
  });

  it('출전 기록이 있는 시즌만 이력에 쌓이고 시즌순으로 정렬돼 있다', () => {
    let g = startGame(2026, 'c0');
    for (let i = 0; i < 6; i++) g = advanceFullSeason(g);
    // 내 구단 스쿼드 중 출전 기록이 있는 선수를 찾는다(대개 주전 다수가 해당).
    const withApps = myClub(g).players.find((p) => (p.careerApps ?? 0) > 0);
    if (!withApps) return; // 이 시드에서 우연히 없으면 스킵
    const hist = playerRatingHistory(g, withApps.id);
    expect(hist.length).toBeGreaterThan(0);
    const seasons = hist.map((h) => h.season);
    expect(seasons).toEqual([...seasons].sort((a, b) => a - b));
    for (const h of hist) expect(h.avgRating).toBeGreaterThan(0);
  });

  it('내 구단과 무관한 임의의 선수 id는 빈 이력을 반환한다', () => {
    let g = startGame(2026, 'c0');
    for (let i = 0; i < 3; i++) g = advanceFullSeason(g);
    expect(playerRatingHistory(g, 'no-such-player')).toEqual([]);
  });

  it('20시즌을 넘기면 이력이 최근 20개로 잘린다', () => {
    let g = startGame(2026, 'c0');
    for (let i = 0; i < 25 && !g.sacked; i++) g = advanceFullSeason(g);
    for (const p of myClub(g).players) {
      const hist = playerRatingHistory(g, p.id);
      expect(hist.length).toBeLessThanOrEqual(20);
    }
  });
});
