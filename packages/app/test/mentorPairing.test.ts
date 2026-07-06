import { describe, it, expect } from 'vitest';
import {
  startGame, myClub, assignMentorAction, clearMentorPairingAction,
  startSeason, playRestOfSeason, finishSeason, lastSummary,
} from '../src/game.js';

describe('B14: 멘토 페어링 지정 (앱 통합)', () => {
  it('멘토 페어링을 지정하면 club.mentorPairings에 반영된다', () => {
    const g = startGame(2026, 'c0');
    const club = myClub(g);
    const mentee = [...club.players].sort((a, b) => a.age - b.age)[0]!;
    const mentor = club.players.find((p) => p.age > mentee.age + 5)!;

    const outcome = assignMentorAction(g, mentor.id, mentee.id);
    expect(outcome.ok).toBe(true);
    const next = myClub(outcome.state);
    expect(next.mentorPairings).toContainEqual({ mentorId: mentor.id, menteeId: mentee.id });
  });

  it('페어링을 해제하면 목록에서 사라진다', () => {
    const g = startGame(2027, 'c0');
    const club = myClub(g);
    const mentee = [...club.players].sort((a, b) => a.age - b.age)[0]!;
    const mentor = club.players.find((p) => p.age > mentee.age + 5)!;
    const afterAssign = assignMentorAction(g, mentor.id, mentee.id);
    expect(afterAssign.ok).toBe(true);

    const outcome = clearMentorPairingAction(afterAssign.state, mentee.id);
    expect(outcome.ok).toBe(true);
    expect(myClub(outcome.state).mentorPairings).toEqual([]);
  });
});

describe('고도화 Item8: 멘토-멘티 관계 심화 (앱 통합)', () => {
  it('멘티가 나이를 넘기며 졸업하면 시즌 요약에 mentorGraduations로 반영된다', () => {
    const g = startGame(3026, 'c0');
    const club = myClub(g);
    const mentee = club.players.find((p) => p.age === 23)!;
    const mentor = club.players.find((p) => p.age > mentee.age + 5)!;
    const afterAssign = assignMentorAction(g, mentor.id, mentee.id);
    expect(afterAssign.ok).toBe(true);

    const finished = finishSeason(playRestOfSeason(startSeason(afterAssign.state)));
    const summary = lastSummary(finished);
    expect(summary?.mentorGraduations?.some((ev) => ev.menteeId === mentee.id && ev.reason === 'age')).toBe(true);
    expect(myClub(finished).mentorPairings ?? []).toHaveLength(0);
  });
});
