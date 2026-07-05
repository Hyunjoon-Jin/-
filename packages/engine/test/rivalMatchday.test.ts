import { describe, it, expect } from 'vitest';
import { settleSeason, RIVAL_MATCHDAY_PREMIUM } from '../src/finance.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';

function makeClub(seed = 1, tier = 12) {
  return generateClub(new Rng(seed), 'c', 'C', tier);
}

describe('신규 개선 항목 23: 라이벌전 매치데이 수익 프리미엄', () => {
  it('라이벌 홈 경기가 없으면(0) 기존과 정확히 동일한 매치데이 수익이다(하위 호환)', () => {
    const clubA = makeClub(1);
    const clubB = makeClub(1);
    const withDefault = settleSeason(clubA, 3, 16);
    const withZero = settleSeason(clubB, 3, 16, undefined, undefined, 0);
    expect(withZero.income.matchday).toBe(withDefault.income.matchday);
    expect(withZero.rivalBonus).toBeUndefined();
    expect(withDefault.rivalBonus).toBeUndefined();
  });

  it('라이벌 홈 경기가 1이면 매치데이 수익이 늘고 rivalBonus가 표시된다', () => {
    const clubNormal = makeClub(2);
    const clubRival = makeClub(2);
    const normal = settleSeason(clubNormal, 3, 16, undefined, undefined, 0);
    const withRival = settleSeason(clubRival, 3, 16, undefined, undefined, 1);
    expect(withRival.income.matchday).toBeGreaterThan(normal.income.matchday);
    expect(withRival.rivalBonus).toBeGreaterThan(0);
    expect(withRival.income.matchday - normal.income.matchday).toBe(withRival.rivalBonus);
  });

  it('rivalBonus는 정확히 (프리미엄 배율-1)만큼의 추가분이다', () => {
    const club = makeClub(3);
    const rep = club.finance.reputation;
    const perGame = rep * 5_000; // recentFormRatio/stadiumLevel 기본값(보정 없음/0)일 때
    const expectedBonus = Math.round(perGame * (RIVAL_MATCHDAY_PREMIUM - 1));
    const report = settleSeason(club, 3, 16, undefined, undefined, 1);
    expect(report.rivalBonus).toBe(expectedBonus);
  });

  it('라이벌 홈 경기 수가 실제 홈 경기 수를 넘지 못하도록 클램프된다', () => {
    const clubA = makeClub(4);
    const clubB = makeClub(4);
    const cappedAtHomeGames = settleSeason(clubA, 3, 16, 2, undefined, 2);
    const overHomeGames = settleSeason(clubB, 3, 16, 2, undefined, 99);
    expect(overHomeGames.income.matchday).toBe(cappedAtHomeGames.income.matchday);
  });

  it('보유 자금에 net이 정상적으로 반영된다(프리미엄 포함 여부와 무관하게 항등식 유지)', () => {
    const club = makeClub(5);
    const before = club.finance.balance;
    const report = settleSeason(club, 3, 16, undefined, undefined, 1);
    expect(club.finance.balance).toBe(before + report.net);
    expect(report.income.total).toBe(
      report.income.tv + report.income.matchday + report.income.sponsor + report.income.prize,
    );
  });
});
