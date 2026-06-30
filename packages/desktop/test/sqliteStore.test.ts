import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SqliteSaveStore } from '../src/sqliteStore.ts';

const meta = (over: Partial<{ clubName: string; season: number; savedAt: string }> = {}) => ({
  clubName: 'FC 서울리온', season: 1, savedAt: '2026-06-30T00:00:00.000Z', ...over,
});

test('save → load 후 JSON 본문이 그대로 복원된다', () => {
  const store = new SqliteSaveStore(':memory:');
  const json = JSON.stringify({ version: 5, hello: 'world', n: [1, 2, 3] });
  store.save('slot1', json, meta());
  assert.equal(store.load('slot1'), json);
});

test('list는 저장 슬롯 메타를 최신순으로 반환', () => {
  const store = new SqliteSaveStore(':memory:');
  store.save('a', '{}', meta({ clubName: 'A', season: 1, savedAt: '2026-01-01T00:00:00.000Z' }));
  store.save('b', '{}', meta({ clubName: 'B', season: 3, savedAt: '2026-03-01T00:00:00.000Z' }));
  const list = store.list();
  assert.equal(list.length, 2);
  assert.equal(list[0]!.id, 'b'); // 최신순
  assert.equal(list[0]!.clubName, 'B');
  assert.equal(list[0]!.season, 3);
});

test('같은 id 재저장은 덮어쓰기(UPSERT), 슬롯 수 불변', () => {
  const store = new SqliteSaveStore(':memory:');
  store.save('s', '{"v":1}', meta({ season: 1 }));
  store.save('s', '{"v":2}', meta({ season: 2 }));
  assert.equal(store.list().length, 1);
  assert.equal(store.load('s'), '{"v":2}');
  assert.equal(store.list()[0]!.season, 2);
});

test('remove는 슬롯을 삭제하고, 없는 슬롯 load는 null', () => {
  const store = new SqliteSaveStore(':memory:');
  store.save('s', '{}', meta());
  store.remove('s');
  assert.equal(store.list().length, 0);
  assert.equal(store.load('s'), null);
  assert.equal(store.load('nope'), null);
});
