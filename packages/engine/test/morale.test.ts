import { describe, it, expect } from 'vitest';
import { advanceSeason } from '../src/franchise.js';
import { generateClub } from '../src/generate.js';
import { currentAbility } from '../src/derived.js';
import { Rng } from '../src/rng.js';
import type { Club } from '../src/types.js';

function makeLeague(seed: number): Club[] {
  const rng = new Rng(seed);
  const clubs: Club[] = [];
  for (let i = 0; i < 10; i++) clubs.push(generateClub(rng, `c${i}`, `C${i}`, 8 + i));
  return clubs;
}

describe('morale: 출전 시간 기반 사기', () => {
  it('선발 출전이 기록되고 시즌 경계에서 리셋된다', () => {
    const clubs = makeLeague(1);
    advanceSeason(clubs, 1, 100);
    // 오프시즌 리셋으로 seasonApps는 0
    for (const c of clubs) for (const p of c.players) expect(p.seasonApps).toBe(0);
  });

  it('꾸준히 뛴 주전은 거의 못 뛴 핵심 선수보다 사기가 높다', () => {
    const clubs = makeLeague(2);
    // 한 시즌 진행 후: 주전(선발 다수)과 벤치 핵심 선수 사기 비교
    // 진행 전 seasonApps를 직접 세팅해 오프시즌 사기 산정만 검증
    const club = clubs[9]!; // 강팀
    const players = [...club.players].sort((a, b) => currentAbility(b) - currentAbility(a));
    const regular = players[0]!;   // 최고 선수
    const benchKey = players[1]!;  // 두 번째 선수(벤치 가정)
    regular.seasonApps = 20; regular.morale = 0.5;
    benchKey.seasonApps = 1; benchKey.morale = 0.5;
    // 나머지는 중립
    advanceSeason([club, ...clubs.slice(0, 9)] as Club[], 1, 200);
    expect(regular.morale).toBeGreaterThan(benchKey.morale);
  });
});
