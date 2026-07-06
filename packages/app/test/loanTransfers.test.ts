import { describe, it, expect } from 'vitest';
import {
  startGame, advanceFullSeason, loanOut, loanIn, recallLoan, myLoanedOutPlayers, myClub,
} from '../src/game.js';

describe('A7: 임대 이적 (앱 통합)', () => {
  it('임대 보낸 선수는 시즌 완주 후에도 임대 기간이 남으면 계속 임대 중이고, 기간이 끝나면 복귀와 함께 요약에 기록된다', () => {
    let g = startGame(2026, 'c0');
    const club = myClub(g);
    const player = club.players[club.players.length - 1]!;
    const targetClubId = g.clubs.find((c) => c.id !== g.myClubId)!.id;

    const outcome = loanOut(g, player.id, targetClubId, { seasons: 2, fee: 100, wageShareByParent: 0.5 });
    expect(outcome.ok).toBe(true);
    g = outcome.state;
    expect(myLoanedOutPlayers(g)).toHaveLength(1);
    expect(myClub(g).players.some((p) => p.id === player.id)).toBe(false);

    g = advanceFullSeason(g); // 시즌 1 완주 — 아직 1시즌 남음
    expect(myLoanedOutPlayers(g)).toHaveLength(1);
    const summary1 = g.history[g.history.length - 1]!;
    expect(summary1.loanReturns ?? []).toHaveLength(0);

    g = advanceFullSeason(g); // 시즌 2 완주 — 임대 종료, 복귀
    expect(myLoanedOutPlayers(g)).toHaveLength(0);
    expect(myClub(g).players.some((p) => p.id === player.id)).toBe(true);
    const summary2 = g.history[g.history.length - 1]!;
    expect(summary2.loanReturns?.length).toBe(1);
    expect(summary2.loanReturns![0]!.playerId).toBe(player.id);
    expect(summary2.loanReturns![0]!.toClubId).toBe(g.myClubId);
  });

  it('다른 구단 선수를 임대로 데려오면 내 스쿼드에 합류하고, 임대가 끝나면 원 소속으로 돌아간다', () => {
    let g = startGame(2027, 'c0');
    const otherClub = g.clubs.find((c) => c.id !== g.myClubId)!;
    const target = otherClub.players[otherClub.players.length - 1]!;

    const outcome = loanIn(g, target.id, otherClub.id, { seasons: 1, fee: 0, wageShareByParent: 0 });
    expect(outcome.ok).toBe(true);
    g = outcome.state;
    expect(myClub(g).players.some((p) => p.id === target.id)).toBe(true);

    g = advanceFullSeason(g); // 임대 기간(1시즌) 종료 → 원 소속으로 복귀
    expect(myClub(g).players.some((p) => p.id === target.id)).toBe(false);
    const summary = g.history[g.history.length - 1]!;
    expect(summary.loanReturns?.some((r) => r.playerId === target.id && r.fromClubId === g.myClubId)).toBe(true);
  });

  it('의무완전이적 조항(A1)을 지정하면 출전 기준 도달 시 다음 시즌 요약에 발동 내역이 실린다', () => {
    let g = startGame(2030, 'c0');
    const club = myClub(g);
    const player = club.players[club.players.length - 1]!;
    // 상대 부 구단으로 보내야(다른 부는 헤드리스 자동 시뮬이라 seasonApps가 건드려지지 않아)
    // 아래에서 수동 설정한 seasonApps 값이 시즌 진행 중 훼손되지 않는다.
    const myDiv = club.division;
    const targetClubId = g.clubs.find((c) => c.division !== myDiv)!.id;

    const outcome = loanOut(g, player.id, targetClubId, {
      seasons: 2, fee: 0, wageShareByParent: 0, buyObligation: { appearances: 15, fee: 9000 },
    });
    expect(outcome.ok).toBe(true);
    g = outcome.state;
    expect(player.loanBuyObligation).toEqual({ appearances: 15, fee: 9000 });

    player.seasonApps = 20; // 기준(15) 이상
    g = advanceFullSeason(g);

    const summary = g.history[g.history.length - 1]!;
    expect(summary.loanObligations?.length).toBe(1);
    expect(summary.loanObligations![0]!.playerId).toBe(player.id);
    expect(summary.loanObligations![0]!.fee).toBe(9000);
    expect(myLoanedOutPlayers(g)).toHaveLength(0); // 완전 이적이라 더는 "임대 보낸 선수"가 아니다.
  });

  it('임대 보낸 선수는 시즌 중 언제든 회수할 수 있다', () => {
    let g = startGame(2028, 'c0');
    const club = myClub(g);
    const player = club.players[club.players.length - 1]!;
    const targetClubId = g.clubs.find((c) => c.id !== g.myClubId)!.id;

    g = loanOut(g, player.id, targetClubId, { seasons: 2, fee: 0, wageShareByParent: 0 }).state;
    expect(myClub(g).players.some((p) => p.id === player.id)).toBe(false);

    const recalled = recallLoan(g, player.id);
    expect(recalled.ok).toBe(true);
    g = recalled.state;
    expect(myClub(g).players.some((p) => p.id === player.id)).toBe(true);
    expect(myLoanedOutPlayers(g)).toHaveLength(0);
  });
});
