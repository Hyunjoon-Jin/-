import { describe, it, expect } from 'vitest';
import { startGame, advanceFullSeason } from '../src/game.js';
import { serialize, deserialize } from '../src/persistence.js';
import { WebSaveStore } from '../src/storage.js';

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

function makeGame() {
  let g = startGame(2026, 'c5');
  g = advanceFullSeason(g); // 시즌 1 진행 → history에 Map 포함 요약 생성
  g = advanceFullSeason(g);
  return g;
}

describe('persistence: 직렬화 라운드트립', () => {
  it('serialize → deserialize 후 핵심 상태가 보존된다', () => {
    const g = makeGame();
    const back = deserialize(serialize(g));

    expect(back.season).toBe(g.season);
    expect(back.myClubId).toBe(g.myClubId);
    expect(back.seed).toBe(g.seed);
    expect(back.clubs.length).toBe(g.clubs.length);
    expect(back.history.length).toBe(g.history.length);
  });

  it('history의 finance Map이 라운드트립 후에도 Map으로 복원된다', () => {
    const g = makeGame();
    const back = deserialize(serialize(g));
    const summary = back.history[0]!;
    expect(summary.finance).toBeInstanceOf(Map);
    // 내 구단 재정 리포트가 보존된다
    const mine = summary.finance.get(g.myClubId);
    const orig = g.history[0]!.finance.get(g.myClubId);
    expect(mine?.net).toBe(orig?.net);
  });

  it('선수 능력치까지 정확히 복원된다', () => {
    const g = makeGame();
    const back = deserialize(serialize(g));
    const p0 = g.clubs[0]!.players[0]!;
    const b0 = back.clubs[0]!.players[0]!;
    expect(b0.id).toBe(p0.id);
    expect(b0.age).toBe(p0.age);
    expect(b0.attributes.finishing).toBe(p0.attributes.finishing);
  });

  it('지원하지 않는 버전은 거부한다', () => {
    const g = makeGame();
    const file = serialize(g);
    file.version = 999;
    expect(() => deserialize(file)).toThrow();
  });
});

describe('storage: 슬롯 저장소', () => {
  it('save → load 후 상태가 보존되고 목록에 나타난다', () => {
    const store = new WebSaveStore(fakeStorage());
    const g = makeGame();
    const meta = store.save('slot1', g);

    expect(meta.season).toBe(g.season);
    expect(meta.clubName).toBe(g.clubs.find((c) => c.id === g.myClubId)!.name);

    const loaded = store.load('slot1');
    expect(loaded).not.toBeNull();
    expect(loaded!.season).toBe(g.season);
    expect(store.list()).toHaveLength(1);
  });

  it('같은 슬롯 재저장은 덮어쓰고 중복 항목을 만들지 않는다', () => {
    const store = new WebSaveStore(fakeStorage());
    let g = makeGame();
    store.save('slot1', g);
    g = advanceFullSeason(g);
    store.save('slot1', g);
    expect(store.list()).toHaveLength(1);
    expect(store.load('slot1')!.season).toBe(g.season);
  });

  it('remove는 슬롯을 지운다', () => {
    const store = new WebSaveStore(fakeStorage());
    store.save('slot1', makeGame());
    store.remove('slot1');
    expect(store.list()).toHaveLength(0);
    expect(store.load('slot1')).toBeNull();
  });

  it('존재하지 않는 슬롯 load는 null', () => {
    const store = new WebSaveStore(fakeStorage());
    expect(store.load('nope')).toBeNull();
  });
});
