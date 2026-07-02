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
