import { describe, it, expect } from 'vitest';
import {
  startGame, startSeason, playRound, paceCheckpoint, liveProgress, liveTable,
} from '../src/game.js';

describe('시즌 중간 페이스 체크포인트', () => {
  it('시즌 시작 직후(0라운드)에는 체크포인트가 없다', () => {
    const g = startSeason(startGame(2026, 'c0'));
    expect(paceCheckpoint(g)).toBeNull();
  });

  it('정확히 체크포인트 라운드(약 1/3, 2/3 지점)에서만 나타나고, 그 외 라운드는 null이다', () => {
    let g = startSeason(startGame(2026, 'c0'));
    const total = liveProgress(g).total;
    const checkpointRounds = [Math.round(total / 3), Math.round(total * 2 / 3)];
    let seenAtCheckpoint = 0;
    for (let i = 0; i < total; i++) {
      g = playRound(g);
      // i+1 = 방금 완료된(마지막으로 끝난) 라운드 번호 — paceCheckpoint는 이제
      // liveProgress().round(다음에 진행할 라운드)가 아니라 이 값을 기준으로 판정한다.
      const justCompletedRound = i + 1;
      const cp = paceCheckpoint(g);
      if (checkpointRounds.includes(justCompletedRound)) {
        expect(cp).not.toBeNull();
        expect(cp!.round).toBe(justCompletedRound);
        seenAtCheckpoint++;
      } else {
        expect(cp).toBeNull();
      }
    }
    expect(seenAtCheckpoint).toBe(2);
  });

  it('체크포인트 status는 목표 순위와의 격차로 정확히 분류된다', () => {
    let g = startSeason(startGame(2026, 'c0'));
    const total = liveProgress(g).total;
    let cp = paceCheckpoint(g);
    for (let i = 0; i < total && !cp; i++) {
      g = playRound(g);
      cp = paceCheckpoint(g);
    }
    expect(cp).not.toBeNull();
    const gap = cp!.objective - cp!.position;
    if (gap >= 2) expect(cp!.status).toBe('ahead');
    else if (gap >= -1) expect(cp!.status).toBe('onTrack');
    else expect(cp!.status).toBe('behind');
  });

  it('시즌 종료(over) 후에는 체크포인트가 없다', () => {
    let g = startSeason(startGame(2026, 'c0'));
    const total = liveProgress(g).total;
    for (let i = 0; i < total; i++) g = playRound(g);
    expect(liveProgress(g).over).toBe(true);
    expect(paceCheckpoint(g)).toBeNull();
  });

  it('라이벌이 같은 부에 있으면 체크포인트에 라이벌 순위가 함께 실린다', () => {
    let g = startSeason(startGame(2026, 'c0'));
    const total = liveProgress(g).total;
    let cp = paceCheckpoint(g);
    for (let i = 0; i < total && !cp; i++) {
      g = playRound(g);
      cp = paceCheckpoint(g);
    }
    expect(cp).not.toBeNull();
    const table = liveTable(g);
    const rivalRow = table.find((r) => r.clubId === g.rivalClubId);
    if (!rivalRow) { expect(cp!.rival).toBeUndefined(); return; }
    expect(cp!.rival).toBeDefined();
    expect(cp!.rival!.name).toBe(rivalRow.name);
    expect(cp!.rival!.position).toBe(table.findIndex((r) => r.clubId === g.rivalClubId) + 1);
  });
});
