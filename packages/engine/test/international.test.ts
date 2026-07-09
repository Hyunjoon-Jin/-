import { describe, it, expect } from 'vitest';
import {
  selectCallUps, runInternationalBreak, runInternationalTournament, clubTournamentHighlight,
} from '../src/international.js';
import { generateClub } from '../src/generate.js';
import { currentAbility } from '../src/derived.js';
import { Rng } from '../src/rng.js';
import type { Club } from '../src/types.js';

function league(seed: number, tiers: number[]): Club[] {
  const rng = new Rng(seed);
  return tiers.map((t, i) => generateClub(rng, `c${i}`, `C${i}`, t));
}

describe('international: 국가대표 차출', () => {
  it('국적별 상위 선수만, 최소 능력 미만은 제외', () => {
    const clubs = league(1, [18, 17, 16, 15]);
    const called = selectCallUps(clubs, 23, 148);
    // 모두 최소 능력 이상
    for (const p of called) expect(currentAbility(p)).toBeGreaterThanOrEqual(148);
    // 국적별 23명 이하
    const byNat = new Map<string, number>();
    for (const p of called) byNat.set(p.nationality, (byNat.get(p.nationality) ?? 0) + 1);
    for (const n of byNat.values()) expect(n).toBeLessThanOrEqual(23);
  });

  it('차출 선수는 캡·사기가 오르고 컨디션이 낮아진다', () => {
    const clubs = league(2, [19, 18, 17, 16]);
    for (const c of clubs) for (const p of c.players) { p.condition = 1; p.morale = 0.5; }
    const before = new Map(clubs.flatMap((c) => c.players).map((p) => [p.id, p.caps]));

    const res = runInternationalBreak(clubs, new Rng(5));
    expect(res.callUps.length).toBeGreaterThan(0);

    for (const cu of res.callUps) {
      const p = clubs.flatMap((c) => c.players).find((x) => x.id === cu.playerId)!;
      expect(p.caps).toBe((before.get(p.id) ?? 0) + 1);
      expect(p.morale).toBeGreaterThan(0.5);
      expect(p.condition).toBeLessThanOrEqual(0.9);
    }
  });

  it('차출되지 않은 선수는 그대로', () => {
    const clubs = league(3, [8, 8]); // 약체 리그 → 차출 대상 거의 없음
    for (const c of clubs) for (const p of c.players) { p.condition = 1; p.caps = 0; }
    const res = runInternationalBreak(clubs, new Rng(9));
    const calledIds = new Set(res.callUps.map((c) => c.playerId));
    for (const p of clubs.flatMap((c) => c.players)) {
      if (!calledIds.has(p.id)) {
        expect(p.caps).toBe(0);
        expect(p.condition).toBe(1);
      }
    }
  });

  it('동일 시드면 동일 결과 (재현성)', () => {
    const a = league(7, [18, 17, 16]);
    const b = league(7, [18, 17, 16]);
    const ra = runInternationalBreak(a, new Rng(4));
    const rb = runInternationalBreak(b, new Rng(4));
    expect(ra.callUps.map((c) => c.playerId)).toEqual(rb.callUps.map((c) => c.playerId));
    expect(ra.injuries).toBe(rb.injuries);
  });
});

describe('international: 비정기 국제대회 (C15)', () => {
  it('참가 자격국이 2개 미만이면 대회가 열리지 않는다(우승 국가 null)', () => {
    // 약체 리그(낮은 tier) → 국제대회 최소 능력(CA 120) 이상인 선수가 사실상 없어 참가국 부족.
    const clubs = league(11, [2, 2]);
    const res = runInternationalTournament(clubs, new Rng(1));
    expect(res.championNation).toBeNull();
    expect(res.rounds.length).toBe(0);
    expect(res.callUps.length).toBe(0);
  });

  it('충분한 참가국이 있으면 토너먼트가 진행되고 우승 국가가 정해진다', () => {
    const clubs = league(12, [18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18]);
    const res = runInternationalTournament(clubs, new Rng(2));
    expect(res.championNation).not.toBeNull();
    expect(res.rounds.length).toBeGreaterThan(0);
    // 마지막 라운드는 결승이어야 한다.
    expect(res.rounds[res.rounds.length - 1]!.name).toBe('결승');
    // 우승 국가는 마지막 라운드의 승자 중 하나여야 한다.
    const finalTie = res.rounds[res.rounds.length - 1]!.ties[0]!;
    expect(finalTie.winnerNation).toBe(res.championNation);
  });

  it('참가 선수는 캡이 오르고, 우승국 소속은 사기 상승폭이 더 크다', () => {
    const clubs = league(13, [18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18]);
    for (const c of clubs) for (const p of c.players) { p.morale = 0.5; p.caps = 0; }
    const res = runInternationalTournament(clubs, new Rng(3));
    expect(res.championNation).not.toBeNull();

    const calledIds = new Set(res.callUps.map((c) => c.playerId));
    const allPlayers = clubs.flatMap((c) => c.players);
    for (const cu of res.callUps) {
      const p = allPlayers.find((x) => x.id === cu.playerId)!;
      expect(p.caps).toBeGreaterThanOrEqual(1);
      expect(p.morale).toBeGreaterThan(0.5);
    }
    // 참가하지 않은 선수는 그대로.
    for (const p of allPlayers) {
      if (!calledIds.has(p.id)) { expect(p.caps).toBe(0); expect(p.morale).toBe(0.5); }
    }
    // 우승국 선수의 평균 사기 상승폭이 대회에 참가한 선수 전체 평균보다 크거나 같다.
    const championCallUps = res.callUps.filter((c) => c.nationality === res.championNation);
    expect(championCallUps.length).toBeGreaterThan(0);
    const championAvgMorale =
      championCallUps.reduce((s, c) => s + allPlayers.find((p) => p.id === c.playerId)!.morale, 0) / championCallUps.length;
    const allAvgMorale =
      res.callUps.reduce((s, c) => s + allPlayers.find((p) => p.id === c.playerId)!.morale, 0) / res.callUps.length;
    expect(championAvgMorale).toBeGreaterThanOrEqual(allAvgMorale);
  });

  it('클럽 시즌 기록(seasonApps/seasonGoals/suspensionMatches)을 오염시키지 않는다', () => {
    const clubs = league(14, [18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18]);
    for (const c of clubs) for (const p of c.players) {
      p.seasonApps = 3; p.seasonGoals = 1; p.suspensionMatches = 0;
    }
    const res = runInternationalTournament(clubs, new Rng(4));
    expect(res.championNation).not.toBeNull();
    for (const p of clubs.flatMap((c) => c.players)) {
      expect(p.seasonApps).toBe(3);
      expect(p.seasonGoals).toBe(1);
      expect(p.suspensionMatches).toBe(0);
    }
  });

  it('동일 시드면 동일 결과 (재현성)', () => {
    const a = league(15, [18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18]);
    const b = league(15, [18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18]);
    const ra = runInternationalTournament(a, new Rng(6));
    const rb = runInternationalTournament(b, new Rng(6));
    expect(ra.championNation).toBe(rb.championNation);
    expect(ra.rounds.map((r) => r.ties.map((t) => [t.homeScore, t.awayScore]))).toEqual(
      rb.rounds.map((r) => r.ties.map((t) => [t.homeScore, t.awayScore])),
    );
  });
});

describe('international: 내 구단 국가대표 성적 하이라이트 (고도화 항목31)', () => {
  it('내 구단에 차출된 선수가 없으면 undefined', () => {
    const clubs = league(20, [18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18]);
    const res = runInternationalTournament(clubs, new Rng(7));
    expect(res.championNation).not.toBeNull();
    const highlight = clubTournamentHighlight(res, '__no_such_club__');
    expect(highlight).toBeUndefined();
  });

  it('내 구단 선수가 차출됐으면 국적·최종 라운드·우승 여부를 뽑는다', () => {
    const clubs = league(21, [18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18]);
    const res = runInternationalTournament(clubs, new Rng(8));
    expect(res.championNation).not.toBeNull();
    // 첫 콜업의 소속 구단을 내 구단으로 삼아 검증(항상 최소 1건 이상 콜업이 있다고 보장됨).
    const myClubId = res.callUps[0]!.clubId;
    const highlight = clubTournamentHighlight(res, myClubId)!;
    expect(highlight).toBeDefined();
    expect(highlight.myNations.length).toBeGreaterThan(0);
    expect(highlight.furthestRoundName).toBeDefined();
    expect(typeof highlight.won).toBe('boolean');
  });

  it('우승국 선수가 있으면 won이 true, 결승 라운드까지 도달했다고 나온다', () => {
    const clubs = league(22, [18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18]);
    const res = runInternationalTournament(clubs, new Rng(9));
    expect(res.championNation).not.toBeNull();
    const championCallUp = res.callUps.find((c) => c.nationality === res.championNation)!;
    const highlight = clubTournamentHighlight(res, championCallUp.clubId)!;
    expect(highlight.won).toBe(true);
    expect(highlight.furthestRoundName).toBe('결승');
  });

  it('대회 자체가 열리지 않았으면(참가국 부족) undefined', () => {
    const clubs = league(23, [2, 2]);
    const res = runInternationalTournament(clubs, new Rng(10));
    expect(res.championNation).toBeNull();
    expect(clubTournamentHighlight(res, 'c0')).toBeUndefined();
  });
});
