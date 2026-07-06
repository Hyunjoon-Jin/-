import { describe, it, expect } from 'vitest';
import {
  loanPlayerOut, renegotiateLoanWageShare,
  LOAN_WAGE_RENEGOTIATION_STEP, LOAN_WAGE_LOW_APPS_THRESHOLD, LOAN_WAGE_HIGH_APPS_THRESHOLD,
} from '../src/transferActions.js';
import { runOffseason } from '../src/franchise.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Club } from '../src/types.js';

function makeLeague(seed = 1, n = 3): Club[] {
  const rng = new Rng(seed);
  const clubs: Club[] = [];
  for (let i = 0; i < n; i++) clubs.push(generateClub(rng, `c${i}`, `C${i}`, 12));
  return clubs;
}

describe('고도화 Item3: 임대 주급 분담 재협상', () => {
  it('출전이 적으면 임대 구단이 분담 인상을 요청해 성사시킬 수 있다', () => {
    const clubs = makeLeague(1);
    const from = clubs[0]!; const to = clubs[1]!;
    const player = from.players[from.players.length - 1]!;
    loanPlayerOut(clubs, from.id, to.id, player.id, { seasons: 1, fee: 0, wageShareByParent: 0.3 });
    player.seasonApps = LOAN_WAGE_LOW_APPS_THRESHOLD - 1;

    const r = renegotiateLoanWageShare(clubs, player.id, 'increase');
    expect(r.ok).toBe(true);
    expect(r.newShare).toBeCloseTo(0.3 + LOAN_WAGE_RENEGOTIATION_STEP);
    expect(player.loanWageShareByParent).toBeCloseTo(0.3 + LOAN_WAGE_RENEGOTIATION_STEP);
  });

  it('출전이 충분하면 원 소속 구단이 분담 인상 요청을 거절한다', () => {
    const clubs = makeLeague(2);
    const from = clubs[0]!; const to = clubs[1]!;
    const player = from.players[from.players.length - 1]!;
    loanPlayerOut(clubs, from.id, to.id, player.id, { seasons: 1, fee: 0, wageShareByParent: 0.3 });
    player.seasonApps = LOAN_WAGE_LOW_APPS_THRESHOLD + 1;

    const r = renegotiateLoanWageShare(clubs, player.id, 'increase');
    expect(r.ok).toBe(false);
    expect(player.loanWageShareByParent).toBe(0.3);
  });

  it('출전이 많으면 원 소속 구단이 분담 인하를 요청해 성사시킬 수 있다', () => {
    const clubs = makeLeague(3);
    const from = clubs[0]!; const to = clubs[1]!;
    const player = from.players[from.players.length - 1]!;
    loanPlayerOut(clubs, from.id, to.id, player.id, { seasons: 1, fee: 0, wageShareByParent: 0.5 });
    player.seasonApps = LOAN_WAGE_HIGH_APPS_THRESHOLD + 1;

    const r = renegotiateLoanWageShare(clubs, player.id, 'decrease');
    expect(r.ok).toBe(true);
    expect(r.newShare).toBeCloseTo(0.5 - LOAN_WAGE_RENEGOTIATION_STEP);
    expect(player.loanWageShareByParent).toBeCloseTo(0.5 - LOAN_WAGE_RENEGOTIATION_STEP);
  });

  it('출전이 적으면 임대 구단이 분담 인하 요청을 거절한다', () => {
    const clubs = makeLeague(4);
    const from = clubs[0]!; const to = clubs[1]!;
    const player = from.players[from.players.length - 1]!;
    loanPlayerOut(clubs, from.id, to.id, player.id, { seasons: 1, fee: 0, wageShareByParent: 0.5 });
    player.seasonApps = LOAN_WAGE_HIGH_APPS_THRESHOLD - 1;

    const r = renegotiateLoanWageShare(clubs, player.id, 'decrease');
    expect(r.ok).toBe(false);
    expect(player.loanWageShareByParent).toBe(0.5);
  });

  it('분담률은 0~1 범위로 clamp된다', () => {
    const clubs = makeLeague(5);
    const from = clubs[0]!; const to = clubs[1]!;
    const player = from.players[from.players.length - 1]!;
    loanPlayerOut(clubs, from.id, to.id, player.id, { seasons: 1, fee: 0, wageShareByParent: 0.95 });
    player.seasonApps = LOAN_WAGE_LOW_APPS_THRESHOLD - 1;

    const r = renegotiateLoanWageShare(clubs, player.id, 'increase');
    expect(r.ok).toBe(true);
    expect(r.newShare).toBe(1);
  });

  it('한 시즌에 한 번만 재협상을 시도할 수 있다(성사 여부와 무관)', () => {
    const clubs = makeLeague(6);
    const from = clubs[0]!; const to = clubs[1]!;
    const player = from.players[from.players.length - 1]!;
    loanPlayerOut(clubs, from.id, to.id, player.id, { seasons: 2, fee: 0, wageShareByParent: 0.3 });
    player.seasonApps = LOAN_WAGE_HIGH_APPS_THRESHOLD + 1; // 인상 요청은 거절될 상황

    const r1 = renegotiateLoanWageShare(clubs, player.id, 'increase');
    expect(r1.ok).toBe(false);

    const r2 = renegotiateLoanWageShare(clubs, player.id, 'decrease');
    expect(r2.ok).toBe(false);
    expect(r2.reason).toContain('이미 분담률 재협상을 시도');
  });

  it('임대 중이 아닌 선수는 재협상할 수 없다', () => {
    const clubs = makeLeague(7);
    const player = clubs[0]!.players[0]!;
    const r = renegotiateLoanWageShare(clubs, player.id, 'increase');
    expect(r.ok).toBe(false);
  });

  it('시즌이 넘어가고 임대가 계속되면 재협상 시도 플래그가 초기화된다', () => {
    const clubs = makeLeague(8);
    const from = clubs[0]!; const to = clubs[1]!;
    const player = from.players[from.players.length - 1]!;
    loanPlayerOut(clubs, from.id, to.id, player.id, { seasons: 2, fee: 0, wageShareByParent: 0.3 });
    player.seasonApps = LOAN_WAGE_LOW_APPS_THRESHOLD - 1;

    renegotiateLoanWageShare(clubs, player.id, 'increase');
    expect(player.loanWageRenegotiatedThisSeason).toBe(true);

    runOffseason(clubs, new Rng(400));
    expect(player.loanFromClubId).toBe(from.id); // 아직 임대 계속
    expect(player.loanWageRenegotiatedThisSeason).toBe(false);
  });
});
