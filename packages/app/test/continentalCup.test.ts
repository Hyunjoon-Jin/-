import { describe, it, expect } from 'vitest';
import {
  startGame, startSeason, finishSeason, playContinentalCupRound, type GameState,
} from '../src/game.js';

describe('대륙컵 (D17)', () => {
  it('시즌 1은 지난 시즌 자격 구단이 없어 대륙컵이 열리지 않는다', () => {
    const g = startSeason(startGame(3001, 'c0'));
    expect(g.continentalCup).toBeNull();
  });

  it('시즌 종료 시 다음 시즌 대륙컵 참가 구단(1부 상위 6개)이 계산된다', () => {
    let g = startSeason(startGame(3002, 'c0'));
    g = finishSeason(g);
    expect(g.continentalQualifierIds).toBeDefined();
    expect(g.continentalQualifierIds!.length).toBe(6);
    // 요약의 진출 여부 플래그가 실제 명단과 일치한다.
    const summary = g.history[g.history.length - 1]!;
    expect(summary.qualifiedForContinental).toBe(g.continentalQualifierIds!.includes('c0'));
  });

  it('다음 시즌엔 자격 구단으로 대륙컵이 생성된다', () => {
    let g = startSeason(startGame(3003, 'c0'));
    g = finishSeason(g); // 시즌 1 종료 → 자격 구단 산출
    g = startSeason(g); // 시즌 2 시작 → 대륙컵 킥오프
    expect(g.continentalCup).not.toBeNull();
    expect(new Set(g.continentalCup!.participantIds)).toEqual(new Set(g.continentalQualifierIds));
  });

  it('대륙컵 다음 라운드를 진행하면 브래킷이 채워지고 결국 우승 구단이 정해진다', () => {
    let g = startSeason(startGame(3004, 'c0'));
    g = finishSeason(g);
    g = startSeason(g);
    expect(g.continentalCup).not.toBeNull();

    let guard = 10;
    while (g.continentalCup!.championId === null && guard-- > 0) {
      g = playContinentalCupRound(g);
    }
    expect(g.continentalCup!.championId).not.toBeNull();
    expect(g.continentalCup!.rounds.length).toBeGreaterThan(0);
  });

  it('시즌을 그냥 종료해도 대륙컵이 자동 완료되고 우승 상금이 지급된다', () => {
    let g = startSeason(startGame(3005, 'c0'));
    g = finishSeason(g);
    g = startSeason(g);
    const qualifiers = g.continentalQualifierIds!;
    const balancesBefore = new Map(qualifiers.map((id) => [id, myClubBalanceOf(g, id)]));

    g = finishSeason(g); // 대륙컵 라운드를 한 번도 안 눌러도 시즌 종료 시 자동 완료돼야 한다.
    const summary = g.history[g.history.length - 1]!;
    expect(summary.continentalCupChampionId).toBeDefined();
    expect(qualifiers).toContain(summary.continentalCupChampionId);

    const champBalanceAfter = myClubBalanceOf(g, summary.continentalCupChampionId!);
    const champBalanceBefore = balancesBefore.get(summary.continentalCupChampionId!)!;
    expect(champBalanceAfter).toBeGreaterThan(champBalanceBefore);
  });
});

function myClubBalanceOf(g: GameState, clubId: string): number {
  return g.clubs.find((c) => c.id === clubId)!.finance.balance;
}
