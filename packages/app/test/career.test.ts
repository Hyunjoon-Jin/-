import { describe, it, expect } from 'vitest';
import { startGame, advanceFullSeason } from '../src/game.js';
import { loadCareer, recordSackedStint } from '../src/career.js';

/** WebSaveStore가 사용하는 메서드만 갖춘 가짜 Storage. */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  } as Storage;
}

describe('career: 감독 커리어 아카이브', () => {
  it('빈 저장소는 빈 배열을 반환한다', () => {
    expect(loadCareer(fakeStorage())).toEqual([]);
  });

  it('경질 스냅샷이 구단명·재임 시즌·우승 횟수를 정확히 담는다', () => {
    const storage = fakeStorage();
    let g = startGame(2026, 'c0');
    g = advanceFullSeason(g); // 시즌 1 진행 → season=2
    g = advanceFullSeason(g); // 시즌 2 진행 → season=3
    const stint = recordSackedStint(g, storage);

    expect(stint.clubName).toBe('FC 서울리온');
    expect(stint.seasons).toBe(2);
    expect(stint.leagueTitles).toBe(g.history.filter((s) => s.championId === 'c0').length);
    expect(stint.cupTitles).toBe(g.history.filter((s) => s.cupChampionId === 'c0').length);
    const positions = g.history.map((s) => s.table.findIndex((r) => r.clubId === 'c0') + 1);
    expect(stint.bestFinish).toBe(Math.min(...positions));
  });

  it('여러 재임을 순서대로 누적한다', () => {
    const storage = fakeStorage();
    const g1 = advanceFullSeason(startGame(2026, 'c0'));
    const g2 = advanceFullSeason(startGame(2030, 'c5'));
    recordSackedStint(g1, storage);
    recordSackedStint(g2, storage);
    const all = loadCareer(storage);
    expect(all.length).toBe(2);
    expect(all[0]!.clubName).toBe('FC 서울리온');
    expect(all[1]!.clubName).not.toBe('FC 서울리온');
  });
});
