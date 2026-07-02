import { describe, it, expect } from 'vitest';
import { runOffseason } from '../src/franchise.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Club } from '../src/types.js';

describe('youthIntake: 유스 아카데미 배출 선수 목록', () => {
  it('intakePlayersByClub의 인원 수가 intakeByClub의 카운트와 정확히 일치한다', () => {
    const rng = new Rng(11);
    const clubs: Club[] = [];
    for (let i = 0; i < 4; i++) clubs.push(generateClub(rng, `c${i}`, `C${i}`, 10 + i));
    const { intakeByClub, intakePlayersByClub } = runOffseason(clubs, new Rng(22));
    for (const club of clubs) {
      const count = intakeByClub.get(club.id) ?? 0;
      const players = intakePlayersByClub.get(club.id) ?? [];
      expect(players.length).toBe(count);
    }
  });

  it('배출된 선수는 16~18세이고, 실제로 구단 스쿼드에 남아 있다(스쿼드 상한 정리로 잘리지 않음)', () => {
    const rng = new Rng(33);
    const clubs: Club[] = [generateClub(rng, 'x', 'X', 14)];
    const { intakePlayersByClub } = runOffseason(clubs, new Rng(44));
    const intake = intakePlayersByClub.get('x') ?? [];
    expect(intake.length).toBeGreaterThan(0);
    for (const p of intake) {
      expect(p.age).toBeGreaterThanOrEqual(16);
      expect(p.age).toBeLessThanOrEqual(18);
      expect(clubs[0]!.players.some((cp) => cp.id === p.id)).toBe(true);
    }
  });

  it('유스 레벨이 높을수록(잠재력 보너스) 평균 잠재력이 낮은 레벨보다 낮지 않다', () => {
    const rngLow = new Rng(55);
    const lowClub = generateClub(rngLow, 'lo', 'Lo', 12);
    lowClub.staff.youth = 1;
    const rngHigh = new Rng(55);
    const highClub = generateClub(rngHigh, 'hi', 'Hi', 12);
    highClub.staff.youth = 20;

    const lowResult = runOffseason([lowClub], new Rng(66));
    const highResult = runOffseason([highClub], new Rng(66));
    const lowIntake = lowResult.intakePlayersByClub.get('lo') ?? [];
    const highIntake = highResult.intakePlayersByClub.get('hi') ?? [];
    const avg = (ps: typeof lowIntake) => ps.reduce((s, p) => s + p.potential, 0) / (ps.length || 1);
    expect(avg(highIntake)).toBeGreaterThanOrEqual(avg(lowIntake));
  });
});
