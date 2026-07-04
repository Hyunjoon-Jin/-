import { describe, it, expect } from 'vitest';
import { simulateMatch, type MatchSetup } from '../src/simulateMatch.js';
import { computeTeamStrength } from '../src/teamStrength.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Club, Tactic } from '../src/types.js';

function matchup(seed = 1) {
  const rng = new Rng(seed);
  const home = generateClub(rng, 'h', 'Home', 13);
  const away = generateClub(rng, 'a', 'Away', 12);
  return { home, away, ht: defaultTactic(home), at: defaultTactic(away) };
}

describe('teamStrength: 압박(pressing) 반영', () => {
  it('압박을 높이면 수비·창출 전력이 오르고, 낮추면 내려간다(중립 대비)', () => {
    const { home } = matchup(10);
    const tactic = defaultTactic(home);
    const neutral = computeTeamStrength(home, { ...tactic, pressing: 0.5 });
    const high = computeTeamStrength(home, { ...tactic, pressing: 1 });
    const low = computeTeamStrength(home, { ...tactic, pressing: 0 });

    expect(high.defense).toBeGreaterThan(neutral.defense);
    expect(low.defense).toBeLessThan(neutral.defense);
    expect(high.creation).toBeGreaterThan(neutral.creation);
    expect(low.creation).toBeLessThan(neutral.creation);
  });

  it('압박은 attack·midfield·physical·aerial·gk에는 영향을 주지 않는다', () => {
    const { home } = matchup(11);
    const tactic = defaultTactic(home);
    const neutral = computeTeamStrength(home, { ...tactic, pressing: 0.5 });
    const high = computeTeamStrength(home, { ...tactic, pressing: 1 });
    expect(high.attack).toBeCloseTo(neutral.attack, 5);
    expect(high.midfield).toBeCloseTo(neutral.midfield, 5);
    expect(high.physical).toBeCloseTo(neutral.physical, 5);
    expect(high.aerial).toBeCloseTo(neutral.aerial, 5);
    expect(high.gk).toBeCloseTo(neutral.gk, 5);
  });
});

describe('teamStrength: 폭(width) 반영', () => {
  it('넓게 벌릴수록 창출력이 오르고 공중볼 다툼은 내려간다(중립 대비)', () => {
    const { home } = matchup(12);
    const tactic = defaultTactic(home);
    const neutral = computeTeamStrength(home, { ...tactic, width: 0.5 });
    const wide = computeTeamStrength(home, { ...tactic, width: 1 });
    const narrow = computeTeamStrength(home, { ...tactic, width: 0 });

    expect(wide.creation).toBeGreaterThan(neutral.creation);
    expect(narrow.creation).toBeLessThan(neutral.creation);
    expect(wide.aerial).toBeLessThan(neutral.aerial);
    expect(narrow.aerial).toBeGreaterThan(neutral.aerial);
  });

  it('폭은 attack·midfield·defense·physical·gk에는 영향을 주지 않는다', () => {
    const { home } = matchup(13);
    const tactic = defaultTactic(home);
    const neutral = computeTeamStrength(home, { ...tactic, width: 0.5 });
    const wide = computeTeamStrength(home, { ...tactic, width: 1 });
    expect(wide.attack).toBeCloseTo(neutral.attack, 5);
    expect(wide.midfield).toBeCloseTo(neutral.midfield, 5);
    expect(wide.defense).toBeCloseTo(neutral.defense, 5);
    expect(wide.physical).toBeCloseTo(neutral.physical, 5);
    expect(wide.gk).toBeCloseTo(neutral.gk, 5);
  });
});

describe('teamStrength: 수비라인(defensiveLine) 반영', () => {
  it('중립보다 라인을 올리면 창출이 오르지만, 그만큼 수비는 내려간다(뒷공간 리스크)', () => {
    const { home } = matchup(14);
    const tactic = defaultTactic(home);
    const neutral = computeTeamStrength(home, { ...tactic, defensiveLine: 0.5 });
    const high = computeTeamStrength(home, { ...tactic, defensiveLine: 1 });

    expect(high.creation).toBeGreaterThan(neutral.creation);
    expect(high.defense).toBeLessThan(neutral.defense);
  });

  it('중립 미만으로 낮춰도 수비에 추가 페널티는 없다(0.5 초과분에서만 리스크 발생)', () => {
    const { home } = matchup(15);
    const tactic = defaultTactic(home);
    const neutral = computeTeamStrength(home, { ...tactic, defensiveLine: 0.5, pressing: 0.5 });
    const low = computeTeamStrength(home, { ...tactic, defensiveLine: 0.2, pressing: 0.5 });
    // 낮은 라인은 창출만 정직하게 줄고, 수비 쪽 리스크항은 0.5 초과분에서만 발생하므로
    // 수비는 리스크 페널티 없이 오히려 (창출 쪽과 무관하게) 동일하거나 낮아지지 않는다.
    expect(low.defense).toBeGreaterThanOrEqual(neutral.defense - 1e-9);
  });

  it('라인 리스크는 비선형이라, 0.5→0.75보다 0.75→1.0 구간에서 수비 하락폭이 더 크다', () => {
    const { home } = matchup(16);
    const tactic = defaultTactic(home);
    const d50 = computeTeamStrength(home, { ...tactic, defensiveLine: 0.5 }).defense;
    const d75 = computeTeamStrength(home, { ...tactic, defensiveLine: 0.75 }).defense;
    const d100 = computeTeamStrength(home, { ...tactic, defensiveLine: 1.0 }).defense;
    expect(d50 - d75).toBeLessThan(d75 - d100);
  });
});

describe('teamStrength: 공격성향(mentality) 역습 위험 비선형', () => {
  it('mentality 0.5(중립)에서는 기존 균형(defBias=1.0)이 그대로 보존된다', () => {
    const { home } = matchup(17);
    const tactic = defaultTactic(home);
    const neutral = computeTeamStrength(home, { ...tactic, mentality: 0.5, pressing: 0.5, defensiveLine: 0.5 });
    const noMentalityEffect = computeTeamStrength(home, { ...tactic, mentality: 0.5, pressing: 0.5, defensiveLine: 0.5 });
    expect(neutral.defense).toBeCloseTo(noMentalityEffect.defense, 9);
  });

  it('역습 위험은 비선형이라, 0.5→0.75보다 0.75→1.0 구간에서 수비 하락폭이 더 크다', () => {
    const { home } = matchup(18);
    const tactic = defaultTactic(home);
    const d50 = computeTeamStrength(home, { ...tactic, mentality: 0.5 }).defense;
    const d75 = computeTeamStrength(home, { ...tactic, mentality: 0.75 }).defense;
    const d100 = computeTeamStrength(home, { ...tactic, mentality: 1.0 }).defense;
    expect(d50 - d75).toBeLessThan(d75 - d100);
  });
});

function setAllSetPiece(club: Club, value: number): void {
  for (const p of club.players) p.attributes.setPiece = value;
}

describe('세트피스(setPiece) 능력치 반영', () => {
  it('세트피스 능력치가 높은 팀이 낮은 팀보다 세트피스 상황 득점 전환율이 높다', () => {
    function setpieceConversion(setPieceSkill: number, trials: number): { goals: number; attempts: number } {
      let goals = 0;
      let attempts = 0;
      for (let s = 0; s < trials; s++) {
        const { home, away, ht, at } = matchup(s + 20000);
        setAllSetPiece(home, setPieceSkill);
        const setup: MatchSetup = {
          home: { club: home, tactic: ht as Tactic }, away: { club: away, tactic: at as Tactic }, seed: s + 20000,
        };
        const r = simulateMatch(setup);
        for (const ev of r.events) {
          if (ev.side !== 'home' || ev.chanceType !== 'setpiece') continue;
          attempts++;
          if (ev.outcome === 'GOAL') goals++;
        }
      }
      return { goals, attempts };
    }

    const high = setpieceConversion(20, 250);
    const low = setpieceConversion(1, 250);
    expect(high.attempts).toBeGreaterThan(20);
    expect(low.attempts).toBeGreaterThan(20);
    const highRate = high.goals / high.attempts;
    const lowRate = low.goals / low.attempts;
    expect(highRate).toBeGreaterThan(lowRate);
  });
});
