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

  it('브라우저/기기에 영구 누적되는 기록이라 자연스러운 상한이 없는 것을 최근 50개로 캡한다', () => {
    const storage = fakeStorage();
    const existing = Array.from({ length: 55 }, (_, i) => ({
      clubName: `구단${i}`, seasons: 1, leagueTitles: 0, cupTitles: 0,
      endedAt: new Date(2020, 0, i + 1).toISOString(),
    }));
    storage.setItem('st_career', JSON.stringify(existing));

    const g = advanceFullSeason(startGame(2026, 'c0'));
    recordSackedStint(g, storage);

    const all = loadCareer(storage);
    expect(all.length).toBe(50);
    // 가장 오래된 항목들이 잘려나가고 최신 기록(방금 추가한 것 포함)은 남아있다.
    expect(all[all.length - 1]!.clubName).toBe('FC 서울리온');
    expect(all.some((c) => c.clubName === '구단0')).toBe(false);
    expect(all.some((c) => c.clubName === '구단54')).toBe(true);
  });
});
