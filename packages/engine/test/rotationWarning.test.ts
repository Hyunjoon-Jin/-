import { describe, it, expect } from 'vitest';
import { buildRotationWarningReport, ROTATION_WARNING_THRESHOLD } from '../src/rotation.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';

function makeClub(seed = 1, tier = 12) {
  return generateClub(new Rng(seed), 'c', 'C', tier);
}

describe('rotation: 로테이션 필요(과사용) 경고 리포트 (고도화 항목30)', () => {
  it('임계값을 넘긴 선수만 리스트에 오르고, 연속 출전 내림차순으로 정렬한다', () => {
    const club = makeClub();
    club.players[0]!.consecutiveStarts = ROTATION_WARNING_THRESHOLD + 3;
    club.players[1]!.consecutiveStarts = ROTATION_WARNING_THRESHOLD + 1;
    club.players[2]!.consecutiveStarts = ROTATION_WARNING_THRESHOLD; // 임계값과 같으면 제외(초과만 포함)
    const report = buildRotationWarningReport(club);
    expect(report.map((r) => r.playerId)).toEqual([club.players[0]!.id, club.players[1]!.id]);
  });

  it('부상·정지 중인 선수는 연속 출전이 임계값을 넘겨도 제외한다', () => {
    const club = makeClub();
    club.players[0]!.consecutiveStarts = ROTATION_WARNING_THRESHOLD + 5;
    club.players[0]!.injuryMatches = 2;
    const report = buildRotationWarningReport(club);
    expect(report.some((r) => r.playerId === club.players[0]!.id)).toBe(false);
  });

  it('경고 대상이 없으면 빈 배열', () => {
    const club = makeClub();
    for (const p of club.players) p.consecutiveStarts = 0;
    expect(buildRotationWarningReport(club)).toEqual([]);
  });
});
