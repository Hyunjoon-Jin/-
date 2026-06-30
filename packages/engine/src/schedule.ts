/**
 * 리그 일정 생성 (라운드 로빈).
 * 서클 메서드로 단일 라운드 로빈을 만들고, 홈/원정을 뒤집어 더블 라운드 로빈 구성.
 * 각 라운드에 모든 팀이 한 경기씩 배정된다.
 */

export interface Fixture {
  round: number;
  homeId: string;
  awayId: string;
}

const BYE = '__bye__';

function singleRoundRobin(ids: string[]): Fixture[] {
  const teams = [...ids];
  if (teams.length % 2 === 1) teams.push(BYE);
  const n = teams.length;
  const rounds = n - 1;
  const half = n / 2;
  const arr = [...teams];
  const fixtures: Fixture[] = [];

  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      const a = arr[i]!;
      const b = arr[n - 1 - i]!;
      if (a === BYE || b === BYE) continue;
      // 라운드마다 홈/원정을 번갈아 공정성 확보
      if (r % 2 === 0) fixtures.push({ round: r + 1, homeId: a, awayId: b });
      else fixtures.push({ round: r + 1, homeId: b, awayId: a });
    }
    // 첫 팀 고정, 나머지 회전
    arr.splice(1, 0, arr.pop()!);
  }
  return fixtures;
}

/** 더블 라운드 로빈: 전반기 + 홈/원정 뒤집은 후반기. */
export function doubleRoundRobin(ids: string[]): Fixture[] {
  const first = singleRoundRobin(ids);
  const firstRounds = first.reduce((m, f) => Math.max(m, f.round), 0);
  const second = first.map((f) => ({
    round: f.round + firstRounds,
    homeId: f.awayId,
    awayId: f.homeId,
  }));
  return [...first, ...second];
}
