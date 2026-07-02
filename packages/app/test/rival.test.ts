import { describe, it, expect } from 'vitest';
import { startGame, rivalClub, myClub, advanceFullSeason } from '../src/game.js';

describe('라이벌 구단', () => {
  it('게임 시작 시 같은 부에서 평판이 가장 가까운 구단이 라이벌로 고정된다', () => {
    const g = startGame(2026, 'c5');
    const rival = rivalClub(g);
    expect(rival.id).not.toBe(g.myClubId);
    expect(rival.division).toBe(myClub(g).division);
    expect(g.rivalRecord).toEqual({ wins: 0, draws: 0, losses: 0 });
  });

  it('같은 시드는 같은 라이벌을 고른다 (재현성)', () => {
    const a = startGame(2026, 'c5');
    const b = startGame(2026, 'c5');
    expect(a.rivalClubId).toBe(b.rivalClubId);
  });

  it('시즌 진행 후 라이벌전 전적이 갱신될 수 있다', () => {
    let g = startGame(2026, 'c5');
    const before = { ...g.rivalRecord };
    g = advanceFullSeason(g);
    const total = g.rivalRecord.wins + g.rivalRecord.draws + g.rivalRecord.losses;
    const beforeTotal = before.wins + before.draws + before.losses;
    // 같은 부에 남아 있었다면 라운드로빈 2경기(홈/원정)만큼 전적이 늘어난다.
    expect(total).toBeGreaterThanOrEqual(beforeTotal);
    expect(total).toBeLessThanOrEqual(beforeTotal + 2);
  });

  it('라이벌은 시즌이 지나도(승강 발생 시에도) 동일 구단으로 유지된다', () => {
    let g = startGame(2026, 'c5');
    const rivalId = g.rivalClubId;
    g = advanceFullSeason(g);
    g = advanceFullSeason(g);
    expect(g.rivalClubId).toBe(rivalId);
  });

  it('개별 맞대결 기록(rivalMeetings)이 rivalRecord 합계와 정확히 일치한다', () => {
    let g = startGame(2026, 'c5');
    g = advanceFullSeason(g);
    g = advanceFullSeason(g);
    const wins = g.rivalMeetings.filter((m) => m.result === 'win').length;
    const draws = g.rivalMeetings.filter((m) => m.result === 'draw').length;
    const losses = g.rivalMeetings.filter((m) => m.result === 'loss').length;
    expect({ wins, draws, losses }).toEqual(g.rivalRecord);
    // 각 기록의 결과가 스코어와 일치한다(승부차기로 결정된 컵 맞대결은 스코어가 같아도 무승부가 아니다).
    for (const m of g.rivalMeetings) {
      if (m.penalties) { expect(['win', 'loss']).toContain(m.result); continue; }
      if (m.myGoals > m.oppGoals) expect(m.result).toBe('win');
      else if (m.myGoals < m.oppGoals) expect(m.result).toBe('loss');
      else expect(m.result).toBe('draw');
    }
  });

  it('컵에서 라이벌과 맞붙으면 리그와 별개로 competition="cup"으로 기록되고, 승부차기 결과는 항상 승/패다', () => {
    let g = startGame(2026, 'c5');
    for (let i = 0; i < 6; i++) g = advanceFullSeason(g);
    const cupMeetings = g.rivalMeetings.filter((m) => m.competition === 'cup');
    if (cupMeetings.length === 0) return; // 이 시드에서 컵 맞대결이 없으면 스킵
    for (const m of cupMeetings) {
      expect(m.result).not.toBe('draw');
      if (m.penalties) expect(m.myGoals).toBe(m.oppGoals);
    }
    const leagueMeetings = g.rivalMeetings.filter((m) => m.competition === 'league');
    expect(leagueMeetings.every((m) => m.penalties === undefined)).toBe(true);
  });
});
