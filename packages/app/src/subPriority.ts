/**
 * 교체 우선순위(선수관리 전면 도입 D28) — 관전 중 벤치 패널에서 드래그로 정한
 * "선호 교체 순서"를 저장한다. 이적/방출로 명단이 바뀌어도 깨지지 않도록 선수
 * ID 목록만 저장하고, 순위가 없는 선수는 항상 뒤에 CA 내림차순으로 붙인다.
 */
const KEY = 'st_sub_priority';

function readAll(storage: Storage): string[] {
  const raw = storage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function loadSubPriority(storage: Storage = window.localStorage): string[] {
  return readAll(storage);
}

export function saveSubPriority(order: string[], storage: Storage = window.localStorage): void {
  storage.setItem(KEY, JSON.stringify(order));
}

/** 저장된 순위대로 정렬하되, 순위가 없는 선수는 CA 내림차순으로 뒤에 붙인다. */
export function sortByPriority<T extends { id: string }>(
  players: T[], order: string[], caOf: (p: T) => number,
): T[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...players].sort((a, b) => {
    const ra = rank.get(a.id), rb = rank.get(b.id);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return caOf(b) - caOf(a);
  });
}
