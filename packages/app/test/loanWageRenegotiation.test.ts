import { describe, it, expect } from 'vitest';
import { startGame, myClub, loanOut, loanIn, renegotiateLoanWageShareAction } from '../src/game.js';
import { LOAN_WAGE_LOW_APPS_THRESHOLD, LOAN_WAGE_HIGH_APPS_THRESHOLD } from '@soccer-tycoon/engine';

describe('고도화 Item3: 임대 주급 분담 재협상 (앱 통합)', () => {
  it('임대 보낸 선수가 출전이 적으면 원 소속 구단이 분담 인상 요청을 거절할 수 있고, 반대일 땐 성사된다', () => {
    const g = startGame(3026, 'c0');
    const otherClub = g.clubs.find((c) => c.id !== g.myClubId)!;
    const player = myClub(g).players[myClub(g).players.length - 1]!;

    const outcome = loanOut(g, player.id, otherClub.id, { seasons: 1, fee: 0, wageShareByParent: 0.2 });
    expect(outcome.ok).toBe(true);
    player.seasonApps = LOAN_WAGE_LOW_APPS_THRESHOLD - 1;

    const r = renegotiateLoanWageShareAction(outcome.state, player.id, 'increase');
    expect(r.ok).toBe(true);
    expect(r.message).toContain('%로 조정');
  });

  it('임대로 데려온 선수가 자리잡으면 원 소속 구단에 분담 인하를 요청할 수 있다', () => {
    const g = startGame(3027, 'c0');
    const otherClub = g.clubs.find((c) => c.id !== g.myClubId)!;
    const player = otherClub.players[otherClub.players.length - 1]!;

    const outcome = loanIn(g, player.id, otherClub.id, { seasons: 1, fee: 0, wageShareByParent: 0.5 });
    expect(outcome.ok).toBe(true);
    const myPlayer = myClub(outcome.state).players.find((p) => p.id === player.id)!;
    myPlayer.seasonApps = LOAN_WAGE_HIGH_APPS_THRESHOLD + 1;

    const r = renegotiateLoanWageShareAction(outcome.state, player.id, 'decrease');
    expect(r.ok).toBe(true);
    expect(myPlayer.loanWageShareByParent).toBeCloseTo(0.35);
  });

  it('한 시즌에 두 번째 시도는 거절되고, 이전 결과와 무관하게 상태가 갱신된다', () => {
    const g = startGame(3028, 'c0');
    const otherClub = g.clubs.find((c) => c.id !== g.myClubId)!;
    const player = myClub(g).players[myClub(g).players.length - 1]!;

    const outcome = loanOut(g, player.id, otherClub.id, { seasons: 1, fee: 0, wageShareByParent: 0.2 });
    player.seasonApps = LOAN_WAGE_LOW_APPS_THRESHOLD - 1;

    const first = renegotiateLoanWageShareAction(outcome.state, player.id, 'increase');
    expect(first.ok).toBe(true);
    const second = renegotiateLoanWageShareAction(first.state, player.id, 'increase');
    expect(second.ok).toBe(false);
    expect(second.message).toContain('이미');
  });

  it('임대 중이 아닌 선수는 재협상 요청이 거절된다', () => {
    const g = startGame(3029, 'c0');
    const player = myClub(g).players[0]!;
    const r = renegotiateLoanWageShareAction(g, player.id, 'increase');
    expect(r.ok).toBe(false);
  });
});
