import { describe, it, expect } from 'vitest';
import { assignMentor, clearMentorPairing, runOffseason, MENTOR_PAIRING_MAX } from '../src/franchise.js';
import { generateClub } from '../src/generate.js';
import { currentAbility } from '../src/derived.js';
import { Rng } from '../src/rng.js';
import type { Club, Player } from '../src/types.js';

function makeClub(seed: number, tier = 12): Club {
  const rng = new Rng(seed);
  return generateClub(rng, 'c', 'C', tier);
}

describe('B14: 멘토 페어링 지정', () => {
  it('멘토가 멘티보다 나이가 많고 멘티가 유망주(23세 이하)면 지정에 성공한다', () => {
    const club = makeClub(1);
    const mentor: Player = { ...club.players[0]!, id: 'mentor-1', age: 32 };
    const mentee: Player = { ...club.players[1]!, id: 'mentee-1', age: 19 };
    club.players = [mentor, mentee];
    const r = assignMentor(club, mentor.id, mentee.id);
    expect(r.ok).toBe(true);
    expect(club.mentorPairings).toEqual([{ mentorId: mentor.id, menteeId: mentee.id }]);
  });

  it('같은 선수를 멘토·멘티로 지정할 수 없다', () => {
    const club = makeClub(2);
    const p = club.players[0]!;
    const r = assignMentor(club, p.id, p.id);
    expect(r.ok).toBe(false);
  });

  it('멘티가 23세를 초과하면 거절된다', () => {
    const club = makeClub(3);
    const mentor: Player = { ...club.players[0]!, id: 'mentor-2', age: 32 };
    const oldMentee: Player = { ...club.players[1]!, id: 'mentee-2', age: 24 };
    club.players = [mentor, oldMentee];
    const r = assignMentor(club, mentor.id, oldMentee.id);
    expect(r.ok).toBe(false);
  });

  it('멘토가 멘티보다 어리거나 같으면 거절된다', () => {
    const club = makeClub(4);
    const youngerMentor: Player = { ...club.players[0]!, id: 'mentor-3', age: 20 };
    const mentee: Player = { ...club.players[1]!, id: 'mentee-3', age: 20 };
    club.players = [youngerMentor, mentee];
    const r = assignMentor(club, youngerMentor.id, mentee.id);
    expect(r.ok).toBe(false);
  });

  it(`동시에 ${MENTOR_PAIRING_MAX}쌍을 초과해 지정할 수 없다`, () => {
    const club = makeClub(5);
    const mentor: Player = { ...club.players[0]!, id: 'mentor-4', age: 35 };
    const mentees: Player[] = Array.from({ length: MENTOR_PAIRING_MAX + 1 }, (_, i) => (
      { ...club.players[0]!, id: `mentee-4-${i}`, age: 18 }
    ));
    club.players = [mentor, ...mentees];
    for (let i = 0; i < MENTOR_PAIRING_MAX; i++) {
      expect(assignMentor(club, mentor.id, mentees[i]!.id).ok).toBe(true);
    }
    const overflow = assignMentor(club, mentor.id, mentees[MENTOR_PAIRING_MAX]!.id);
    expect(overflow.ok).toBe(false);
  });

  it('이미 지정된 멘티를 다시 지정하면 상한을 소모하지 않고 멘토만 교체된다', () => {
    const club = makeClub(6);
    const mentorA: Player = { ...club.players[0]!, id: 'mentor-a', age: 35 };
    const mentorB: Player = { ...club.players[0]!, id: 'mentor-b', age: 33 };
    const mentee: Player = { ...club.players[1]!, id: 'mentee-5', age: 18 };
    club.players = [mentorA, mentorB, mentee];
    expect(assignMentor(club, mentorA.id, mentee.id).ok).toBe(true);
    expect(assignMentor(club, mentorB.id, mentee.id).ok).toBe(true);
    expect(club.mentorPairings).toHaveLength(1);
    expect(club.mentorPairings![0]!.mentorId).toBe(mentorB.id);
  });

  it('clearMentorPairing으로 지정을 해제할 수 있다', () => {
    const club = makeClub(7);
    const mentor: Player = { ...club.players[0]!, id: 'mentor-6', age: 32 };
    const mentee: Player = { ...club.players[1]!, id: 'mentee-6', age: 19 };
    club.players = [mentor, mentee];
    assignMentor(club, mentor.id, mentee.id);
    clearMentorPairing(club, mentee.id);
    expect(club.mentorPairings).toEqual([]);
  });

  it('지정된 멘토가 있으면(자동 멘토링 조건 미충족이라도) 같은 조건에서 성장이 더 빠르다', () => {
    function trial(withPairing: boolean) {
      const club = makeClub(42);
      // 자동 멘토링 조건(같은 라인 리더/베테랑)을 피하기 위해 다른 라인으로 배치.
      const mentor: Player = {
        ...club.players[0]!, id: 'mentor-7', age: 30, position: 'GK', traits: [],
        attributes: { ...club.players[0]!.attributes, leadership: 5 },
      };
      const mentee: Player = {
        ...club.players[1]!, id: 'mentee-7', age: 18, position: 'ST', potential: 190,
      };
      for (const k in mentee.attributes) (mentee.attributes as Record<string, number>)[k] = 8;
      club.players = [mentor, mentee, ...club.players.slice(2)];
      if (withPairing) assignMentor(club, mentor.id, mentee.id);
      runOffseason([club], new Rng(99));
      const after = club.players.find((p) => p.id === 'mentee-7')!;
      return currentAbility(after);
    }
    const caWithout = trial(false);
    const caWith = trial(true);
    expect(caWith).toBeGreaterThan(caWithout);
  });

  it('멘토가 스쿼드를 떠나면 페어링이 정리되고 더 이상 보너스가 적용되지 않는다', () => {
    const club = makeClub(8);
    const mentor: Player = { ...club.players[0]!, id: 'mentor-8', age: 32 };
    const mentee: Player = { ...club.players[1]!, id: 'mentee-8', age: 19 };
    club.players = [mentor, mentee, ...club.players.slice(2)];
    assignMentor(club, mentor.id, mentee.id);
    club.players = club.players.filter((p) => p.id !== mentor.id); // 멘토 이적/방출 시뮬레이션
    runOffseason([club], new Rng(100));
    expect(club.mentorPairings ?? []).toHaveLength(0);
  });
});

describe('고도화 Item8: 멘토-멘티 관계 심화', () => {
  it('페어링이 유지되는 시즌마다 멘토가 소폭 사기 보상을 받는다', () => {
    const club = makeClub(20);
    const mentor: Player = { ...club.players[0]!, id: 'mentor-r1', age: 32, morale: 0.5 };
    const mentee: Player = { ...club.players[1]!, id: 'mentee-r1', age: 19, morale: 0.5 };
    club.players = [mentor, mentee, ...club.players.slice(2)];
    assignMentor(club, mentor.id, mentee.id);
    runOffseason([club], new Rng(200));
    const after = club.players.find((p) => p.id === 'mentor-r1')!;
    expect(after.morale).toBeGreaterThan(0.5);
  });

  it('멘티가 23세를 초과하면 "졸업"으로 페어링이 자동 해제되고 이벤트가 기록된다', () => {
    const club = makeClub(21);
    const mentor: Player = { ...club.players[0]!, id: 'mentor-r2', age: 35 };
    const mentee: Player = { ...club.players[1]!, id: 'mentee-r2', age: 23 };
    club.players = [mentor, mentee, ...club.players.slice(2)];
    assignMentor(club, mentor.id, mentee.id);
    const result = runOffseason([club], new Rng(201));
    expect(club.mentorPairings ?? []).toHaveLength(0);
    expect(result.mentorGraduations).toHaveLength(1);
    expect(result.mentorGraduations[0]).toMatchObject({
      mentorId: mentor.id, menteeId: mentee.id, reason: 'age',
    });
  });

  it('멘티의 CA가 멘토를 따라잡거나 추월하면 "졸업"으로 페어링이 자동 해제된다', () => {
    const club = makeClub(22);
    const mentor: Player = { ...club.players[0]!, id: 'mentor-r3', age: 26 }; // 은퇴 위험 없는 나이
    for (const k in mentor.attributes) (mentor.attributes as Record<string, number>)[k] = 8;
    const mentee: Player = { ...club.players[1]!, id: 'mentee-r3', age: 19, potential: 200 };
    for (const k in mentee.attributes) (mentee.attributes as Record<string, number>)[k] = 19;
    club.players = [mentor, mentee, ...club.players.slice(2)];
    assignMentor(club, mentor.id, mentee.id);
    const result = runOffseason([club], new Rng(202));
    expect(club.mentorPairings ?? []).toHaveLength(0);
    expect(result.mentorGraduations).toHaveLength(1);
    expect(result.mentorGraduations[0]!.reason).toBe('surpassed');
  });

  it('다혈질 멘토×차분한 멘티 조합은 성향 충돌로 지정 멘토링 효과가 자동 멘토링보다 크지 않다', () => {
    function trial(mentorTrait: 'hothead' | undefined) {
      const club = makeClub(23);
      const mentor: Player = {
        ...club.players[0]!, id: 'mentor-r4', age: 30, position: 'GK',
        traits: mentorTrait ? [mentorTrait] : [],
        attributes: { ...club.players[0]!.attributes, leadership: 5 },
      };
      const mentee: Player = {
        ...club.players[1]!, id: 'mentee-r4', age: 18, position: 'ST', potential: 190, traits: ['rock'],
      };
      for (const k in mentee.attributes) (mentee.attributes as Record<string, number>)[k] = 8;
      club.players = [mentor, mentee, ...club.players.slice(2)];
      assignMentor(club, mentor.id, mentee.id);
      runOffseason([club], new Rng(99));
      const after = club.players.find((p) => p.id === 'mentee-r4')!;
      return currentAbility(after);
    }
    const caWithClash = trial('hothead');
    const caWithoutClash = trial(undefined);
    expect(caWithClash).toBeLessThan(caWithoutClash);
  });
});
