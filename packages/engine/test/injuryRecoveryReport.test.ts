import { describe, it, expect } from 'vitest';
import { buildInjuryRecoveryReport } from '../src/injury.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import { applyMatchEffects } from '../src/matchEffects.js';
import { simulateMatch } from '../src/simulateMatch.js';

function makeClub(seed = 1, tier = 12) {
  return generateClub(new Rng(seed), 'c', 'C', tier);
}

describe('신규 개선 항목 28: 부상 회복 진행 현황', () => {
  it('부상이 없는 선수는 리포트에 나오지 않는다', () => {
    const club = makeClub();
    expect(buildInjuryRecoveryReport(club)).toEqual([]);
  });

  it('부상 중인 선수는 총 기간·잔여 기간·진행률을 담아 반환한다', () => {
    const club = makeClub();
    const p = club.players[0]!;
    p.injuryMatches = 3;
    p.injuryTotalMatches = 6;
    p.injuryName = '햄스트링 부상';
    const report = buildInjuryRecoveryReport(club);
    expect(report).toHaveLength(1);
    expect(report[0]!.totalMatches).toBe(6);
    expect(report[0]!.remainingMatches).toBe(3);
    expect(report[0]!.progress).toBeCloseTo(0.5, 6);
  });

  it('injuryTotalMatches가 없는(구버전 세이브) 선수는 총 기간=잔여 기간으로 취급한다(진행률 0)', () => {
    const club = makeClub();
    const p = club.players[0]!;
    p.injuryMatches = 4;
    p.injuryTotalMatches = undefined;
    const report = buildInjuryRecoveryReport(club);
    expect(report[0]!.totalMatches).toBe(4);
    expect(report[0]!.progress).toBe(0);
  });

  it('회복이 임박한(진행률이 높은) 선수 순으로 정렬된다', () => {
    const club = makeClub();
    club.players[0]!.injuryMatches = 1;
    club.players[0]!.injuryTotalMatches = 10; // 진행률 0.9
    club.players[1]!.injuryMatches = 9;
    club.players[1]!.injuryTotalMatches = 10; // 진행률 0.1
    const report = buildInjuryRecoveryReport(club);
    expect(report[0]!.playerId).toBe(club.players[0]!.id);
    expect(report[1]!.playerId).toBe(club.players[1]!.id);
  });

  it('실제 경기에서 부상이 발생하면 injuryTotalMatches가 injuryMatches와 함께 설정된다', () => {
    let found = false;
    // 부상이 나올 때까지 시드를 바꿔가며 실제 경기 시뮬레이션 결과로 재현한다.
    for (let seed = 1; seed <= 300 && !found; seed++) {
      const home = makeClub(1);
      const away = makeClub(2);
      const result = simulateMatch({
        home: { club: home, tactic: defaultTactic(home) },
        away: { club: away, tactic: defaultTactic(away) },
        seed,
      });
      if (result.injuries.length === 0) continue;
      applyMatchEffects(home, defaultTactic(home), away, defaultTactic(away), result, new Rng(seed));
      const report = [...buildInjuryRecoveryReport(home), ...buildInjuryRecoveryReport(away)];
      expect(report.length).toBeGreaterThan(0);
      for (const entry of report) {
        expect(entry.totalMatches).toBeGreaterThan(0);
        expect(entry.remainingMatches).toBe(entry.totalMatches); // 방금 발생 → 잔여=총 기간
        expect(entry.progress).toBe(0); // 방금 발생 → 회복 진행 없음
      }
      found = true;
    }
    expect(found).toBe(true);
  });
});
