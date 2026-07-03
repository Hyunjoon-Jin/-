import { describe, it, expect } from 'vitest';
import {
  startGame, advanceFullSeason, playerRatingHistory, formStability, myClub, release,
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

  it('방출된 선수의 이력 키는 다음 시즌 종료 시 정리된다(세이브 크기 증가 방지)', () => {
    let g = startGame(2026, 'c0');
    for (let i = 0; i < 3; i++) g = advanceFullSeason(g);
    const departed = myClub(g).players.find((p) => (g.ratingHistory[p.id]?.length ?? 0) > 0);
    if (!departed) return; // 이 시드에서 우연히 없으면 스킵
    expect(Object.keys(g.ratingHistory)).toContain(departed.id);

    const r = release(g, departed.id);
    expect(r.ok).toBe(true);
    g = advanceFullSeason(r.state);

    expect(Object.keys(g.ratingHistory)).not.toContain(departed.id);
    // 현재 스쿼드 선수의 키는 여전히 살아있어야 한다(과잉 정리 아님).
    const stillMine = myClub(g).players.find((p) => (g.ratingHistory[p.id]?.length ?? 0) > 0);
    expect(stillMine).toBeDefined();
  });
});

describe('폼 안정성(formStability) 판정', () => {
  it('3시즌 미만이면 판단을 보류(null)한다', () => {
    expect(formStability([])).toBeNull();
    expect(formStability([{ season: 1, avgRating: 6.0 }])).toBeNull();
    expect(formStability([{ season: 1, avgRating: 6.0 }, { season: 2, avgRating: 6.1 }])).toBeNull();
  });

  it('평점 변동이 작으면 steady로 판정한다', () => {
    const hist = [
      { season: 1, avgRating: 6.0 }, { season: 2, avgRating: 6.05 },
      { season: 3, avgRating: 5.95 }, { season: 4, avgRating: 6.02 },
    ];
    expect(formStability(hist)).toBe('steady');
  });

  it('평점 변동이 크면 volatile로 판정한다', () => {
    const hist = [
      { season: 1, avgRating: 5.0 }, { season: 2, avgRating: 7.0 },
      { season: 3, avgRating: 5.2 }, { season: 4, avgRating: 6.9 },
    ];
    expect(formStability(hist)).toBe('volatile');
  });
});
