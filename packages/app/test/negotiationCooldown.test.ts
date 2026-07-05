import { describe, it, expect } from 'vitest';
import { startGame, myClub, negotiate, recordNegotiationBreakdown } from '../src/game.js';

describe('Item1: 에이전트 협상 결렬 블랙리스트', () => {
  it('결렬 기록 전에는 negotiate가 정상적으로 엔진 평가를 위임한다', () => {
    const g = startGame(2026, 'c0');
    const otherClub = g.clubs.find((c) => c.id !== g.myClubId)!;
    const target = otherClub.players[0]!;
    const r = negotiate(g, target.id, 1);
    // 예산 미달 등 다른 이유로 실패할 수는 있어도, 쿨다운으로 인한 강제 거절은 아니다.
    expect(r.roundsExhausted && r.reason?.includes('결렬 여파')).toBeFalsy();
  });

  it('결렬을 기록하면 같은 시즌에는 재협상이 곧장 거절된다', () => {
    const g = startGame(2026, 'c0');
    const otherClub = g.clubs.find((c) => c.id !== g.myClubId)!;
    const target = otherClub.players[0]!;
    const withBreakdown = recordNegotiationBreakdown(g, target.id);
    const r = negotiate(withBreakdown, target.id, 999_999_999);
    expect(r.ok).toBe(true);
    expect(r.outcome).toBe('rejected');
    expect(r.roundsExhausted).toBe(true);
  });

  it('다음 시즌이 되면 다시 협상할 수 있다', () => {
    const g = startGame(2027, 'c0');
    const otherClub = g.clubs.find((c) => c.id !== g.myClubId)!;
    const target = otherClub.players[0]!;
    const withBreakdown = recordNegotiationBreakdown(g, target.id);
    const nextSeasonState = { ...withBreakdown, season: withBreakdown.season + 1 };
    const r = negotiate(nextSeasonState, target.id, 1);
    expect(r.roundsExhausted && r.reason?.includes('결렬 여파')).toBeFalsy();
  });

  it('결렬 기록은 다른 선수의 협상에는 영향을 주지 않는다', () => {
    const g = startGame(2028, 'c0');
    const otherClub = g.clubs.find((c) => c.id !== g.myClubId)!;
    const targetA = otherClub.players[0]!;
    const targetB = otherClub.players[1]!;
    const withBreakdown = recordNegotiationBreakdown(g, targetA.id);
    const r = negotiate(withBreakdown, targetB.id, 1);
    expect(r.roundsExhausted && r.reason?.includes('결렬 여파')).toBeFalsy();
  });

  it('myClub 선수 명단에는 부작용이 없다(에이전트 관계 지수 하락은 Item6에서 의도된 부작용)', () => {
    const g = startGame(2029, 'c0');
    const club = myClub(g);
    const before = JSON.stringify(club.players);
    recordNegotiationBreakdown(g, 'someone');
    expect(JSON.stringify(myClub(g).players)).toBe(before);
  });
});
