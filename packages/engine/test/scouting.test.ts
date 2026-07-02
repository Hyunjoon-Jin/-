import { describe, it, expect } from 'vitest';
import { buildScoutingReport } from '../src/scouting.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Attributes, Player } from '../src/types.js';
import { ALL_ATTRS } from '../src/types.js';

function makePlayer(overrides: Partial<Player> & { attrVal: number }): Player {
  const attributes = {} as Attributes;
  for (const k of ALL_ATTRS) attributes[k] = overrides.attrVal;
  return {
    id: 'p1', name: 'Test', nationality: 'KOR', age: overrides.age ?? 25,
    position: overrides.position ?? 'MC', familiarity: { MC: 1 }, attributes,
    potential: overrides.potential ?? overrides.attrVal * 10,
    condition: 1, morale: 0.5, seasonApps: 0, injuryMatches: 0, yellowCards: 0,
    suspensionMatches: 0, contractYears: 3, wage: 0, trainingFocus: 'balanced',
    traits: [], caps: 0, seasonGoals: 0, careerApps: 0, careerGoals: 0, caHistory: [],
  };
}

describe('scouting: 전체 등급(overallTier)', () => {
  it('CA가 높을수록 상위 등급', () => {
    const low = buildScoutingReport(makePlayer({ attrVal: 8 }), 20);
    const mid = buildScoutingReport(makePlayer({ attrVal: 14 }), 20);
    const high = buildScoutingReport(makePlayer({ attrVal: 19 }), 20);
    const rank = { fringe: 0, squad: 1, quality: 2, star: 3, worldClass: 4 };
    expect(rank[high.overallTier]).toBeGreaterThan(rank[mid.overallTier]);
    expect(rank[mid.overallTier]).toBeGreaterThan(rank[low.overallTier]);
  });
});

describe('scouting: 나이 프로필', () => {
  it('나이대별로 올바른 프로필을 부여한다', () => {
    expect(buildScoutingReport(makePlayer({ attrVal: 12, age: 18 }), 20).ageProfile).toBe('wonderkid');
    expect(buildScoutingReport(makePlayer({ attrVal: 12, age: 26 }), 20).ageProfile).toBe('prime');
    expect(buildScoutingReport(makePlayer({ attrVal: 12, age: 32 }), 20).ageProfile).toBe('veteran');
    expect(buildScoutingReport(makePlayer({ attrVal: 12, age: 36 }), 20).ageProfile).toBe('declining');
  });
});

describe('scouting: 잠재력 등급', () => {
  it('스카우팅 레벨이 낮으면 미상 처리', () => {
    const p = makePlayer({ attrVal: 10, age: 19, potential: 190 });
    expect(buildScoutingReport(p, 5).potentialTier).toBe('unknown');
  });

  it('충분한 스카우팅이면 갭 크기에 따라 등급이 갈린다', () => {
    const young = makePlayer({ attrVal: 10, age: 19 });
    const genl = buildScoutingReport({ ...young, potential: 100 + 60 }, 20);
    const high = buildScoutingReport({ ...young, potential: 100 + 30 }, 20);
    const moderate = buildScoutingReport({ ...young, potential: 100 + 12 }, 20);
    const limited = buildScoutingReport({ ...young, potential: 100 + 2 }, 20);
    expect(genl.potentialTier).toBe('generational');
    expect(high.potentialTier).toBe('high');
    expect(moderate.potentialTier).toBe('moderate');
    expect(limited.potentialTier).toBe('limited');
  });

  it('30세 이상은 갭이 커도 제한적으로 취급(노장 실현 가능성 낮음)', () => {
    const old = makePlayer({ attrVal: 14, age: 33, potential: 100 + 190 });
    expect(buildScoutingReport(old, 20).potentialTier).toBe('limited');
  });
});

describe('scouting: 강점·약점', () => {
  it('강점은 관련 능력 중 최고치, 약점은 최저치를 반영한다', () => {
    const rng = new Rng(1);
    const club = generateClub(rng, 'c', 'C', 12);
    const player = club.players.find((p) => p.position !== 'GK')!;
    const report = buildScoutingReport(player, 20);
    expect(report.strengths).toHaveLength(3);
    expect(report.weaknesses).toHaveLength(3);
    // 강점 중 첫 값이 약점 중 첫 값보다 능력치가 높거나 같다
    expect(player.attributes[report.strengths[0]!]).toBeGreaterThanOrEqual(player.attributes[report.weaknesses[0]!]);
    // 강점은 내림차순, 약점은 오름차순
    for (let i = 1; i < report.strengths.length; i++) {
      expect(player.attributes[report.strengths[i - 1]!]).toBeGreaterThanOrEqual(player.attributes[report.strengths[i]!]);
    }
    for (let i = 1; i < report.weaknesses.length; i++) {
      expect(player.attributes[report.weaknesses[i - 1]!]).toBeLessThanOrEqual(player.attributes[report.weaknesses[i]!]);
    }
  });

  it('GK는 골키핑+정신 능력 풀에서만 뽑는다', () => {
    const rng = new Rng(2);
    const club = generateClub(rng, 'c', 'C', 12);
    const gk = club.players.find((p) => p.position === 'GK')!;
    const report = buildScoutingReport(gk, 20);
    const technicalOnly = new Set(['finishing', 'shooting', 'crossing', 'dribbling']);
    for (const k of [...report.strengths, ...report.weaknesses]) {
      expect(technicalOnly.has(k)).toBe(false);
    }
  });

  it('공격수의 강점/약점 풀에는 태클링·마크 같은 무관한 수비 능력치가 나오지 않는다', () => {
    // 수비 능력치를 일부러 낮게, 공격 능력치를 일부러 높게 채운 스트라이커 —
    // 예전엔 필드 플레이어 전체가 같은 통짜 풀을 써서 "약점"에 태클링이 흔히 등장했다.
    const player = makePlayer({ position: 'ST', attrVal: 15 });
    player.attributes.tackling = 1;
    player.attributes.marking = 1;
    player.attributes.finishing = 20;
    const report = buildScoutingReport(player, 20);
    const defensiveOnly = new Set(['tackling', 'marking']);
    for (const k of [...report.strengths, ...report.weaknesses]) {
      expect(defensiveOnly.has(k)).toBe(false);
    }
  });
});
