import { describe, it, expect } from 'vitest';
import { runOffseason } from '../src/franchise.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';

/**
 * 라커룸 케미스트리(Phase 6 A15) 회귀 테스트.
 * 다혈질(hothead) 특성 보유자가 2명 이상이면 오프시즌 사기 수렴이 느려지고,
 * 리더(leader) 특성 보유자가 있으면 그 마찰이 상쇄된다.
 * 두 비교 대상 구단은 동일 시드로 생성해 나이·능력치가 완전히 같으므로(은퇴 연령
 * 37세 미만이라 은퇴 변수 없음), traits만 다르게 주입해 사기 수렴 속도만 분리 관찰한다.
 */
function primeMoraleAndApps(club: ReturnType<typeof generateClub>): void {
  for (const p of club.players) {
    p.traits = [];
    p.morale = 0.1;
    p.seasonApps = 0;
  }
}

function avgMorale(club: ReturnType<typeof generateClub>): number {
  return club.players.reduce((s, p) => s + p.morale, 0) / club.players.length;
}

describe('라커룸 케미스트리(A15)', () => {
  it('다혈질 2명 이상(리더 부재)이면 사기 수렴이 평범한 스쿼드보다 느리다', () => {
    const seed = 777;
    const friction = generateClub(new Rng(seed), 'f', 'Friction', 12);
    const baseline = generateClub(new Rng(seed), 'b', 'Baseline', 12);
    primeMoraleAndApps(friction);
    primeMoraleAndApps(baseline);
    friction.players[0]!.traits = ['hothead'];
    friction.players[1]!.traits = ['hothead'];

    runOffseason([friction], new Rng(seed + 1));
    runOffseason([baseline], new Rng(seed + 1));

    // 시작 사기(0.1)에서 각자의 목표치로 수렴하되, 마찰이 있는 쪽이 리텐션이 커서
    // 목표치에 덜 다가가(=평균 사기가 더 낮게) 남는다.
    expect(avgMorale(friction)).toBeLessThan(avgMorale(baseline));
  });

  it('다혈질이 2명이어도 리더가 있으면 마찰이 상쇄돼 수렴이 더 빠르다', () => {
    const seed = 888;
    const withLeader = generateClub(new Rng(seed), 'l', 'Leader', 12);
    const withoutLeader = generateClub(new Rng(seed), 'n', 'NoLeader', 12);
    primeMoraleAndApps(withLeader);
    primeMoraleAndApps(withoutLeader);
    withLeader.players[0]!.traits = ['hothead'];
    withLeader.players[1]!.traits = ['hothead'];
    withLeader.players[2]!.traits = ['leader'];
    withoutLeader.players[0]!.traits = ['hothead'];
    withoutLeader.players[1]!.traits = ['hothead'];

    runOffseason([withLeader], new Rng(seed + 1));
    runOffseason([withoutLeader], new Rng(seed + 1));

    // 리더가 있으면 마찰 상쇄 + 리더 보너스(+0.05)까지 더해져 확실히 더 높게 수렴한다.
    expect(avgMorale(withLeader)).toBeGreaterThan(avgMorale(withoutLeader));
  });
});
