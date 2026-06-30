/**
 * 세이브 저장소 (슬롯 기반).
 * SaveStore 인터페이스 + localStorage 구현.
 * Electron 도입 시 동일 인터페이스의 SQLite 구현을 드롭인할 수 있다.
 */
import type { GameState } from './game.js';
import { serialize, deserialize, type SaveFile } from './persistence.js';

export interface SaveSlotMeta {
  id: string;
  clubName: string;
  season: number;
  savedAt: string;
}

export interface SaveStore {
  list(): SaveSlotMeta[];
  save(id: string, state: GameState): SaveSlotMeta;
  load(id: string): GameState | null;
  remove(id: string): void;
}

const KEY_PREFIX = 'st_save_';
const INDEX_KEY = 'st_save_index';

function clubNameOf(state: GameState): string {
  return state.clubs.find((c) => c.id === state.myClubId)?.name ?? '(알 수 없음)';
}

/**
 * 브라우저 localStorage(또는 Storage 호환 객체) 기반 저장소.
 * 테스트에서는 Map 기반 가짜 Storage를 주입할 수 있다.
 */
export class WebSaveStore implements SaveStore {
  constructor(private storage: Storage) {}

  private readIndex(): SaveSlotMeta[] {
    const raw = this.storage.getItem(INDEX_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as SaveSlotMeta[];
    } catch {
      return [];
    }
  }

  private writeIndex(metas: SaveSlotMeta[]): void {
    this.storage.setItem(INDEX_KEY, JSON.stringify(metas));
  }

  list(): SaveSlotMeta[] {
    // 최근 저장 순
    return this.readIndex().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  save(id: string, state: GameState): SaveSlotMeta {
    const file = serialize(state);
    this.storage.setItem(KEY_PREFIX + id, JSON.stringify(file));
    const meta: SaveSlotMeta = {
      id,
      clubName: clubNameOf(state),
      season: state.season,
      savedAt: file.savedAt,
    };
    const index = this.readIndex().filter((m) => m.id !== id);
    index.push(meta);
    this.writeIndex(index);
    return meta;
  }

  load(id: string): GameState | null {
    const raw = this.storage.getItem(KEY_PREFIX + id);
    if (!raw) return null;
    try {
      return deserialize(JSON.parse(raw) as SaveFile);
    } catch {
      // 손상되었거나 호환되지 않는(구버전) 세이브 → 로드 불가
      return null;
    }
  }

  remove(id: string): void {
    this.storage.removeItem(KEY_PREFIX + id);
    this.writeIndex(this.readIndex().filter((m) => m.id !== id));
  }
}

/** Electron 프리로드가 노출하는 SQLite 세이브 API(동기 IPC). */
export interface SaveApi {
  list(): SaveSlotMeta[];
  load(id: string): string | null;
  save(id: string, json: string, meta: SaveSlotMeta): void;
  remove(id: string): void;
}

/**
 * Electron(메인 프로세스 SQLite) 기반 저장소.
 * 직렬화는 렌더러에서 수행하고, 본문 JSON과 메타를 IPC로 메인에 넘긴다.
 * WebSaveStore와 동일한 SaveStore 인터페이스 → App 코드는 어느 쪽이든 동일.
 */
export class ElectronSaveStore implements SaveStore {
  constructor(private api: SaveApi) {}

  list(): SaveSlotMeta[] {
    return this.api.list().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  save(id: string, state: GameState): SaveSlotMeta {
    const file = serialize(state);
    const meta: SaveSlotMeta = {
      id, clubName: clubNameOf(state), season: state.season, savedAt: file.savedAt,
    };
    this.api.save(id, JSON.stringify(file), meta);
    return meta;
  }

  load(id: string): GameState | null {
    const json = this.api.load(id);
    if (!json) return null;
    try {
      return deserialize(JSON.parse(json) as SaveFile);
    } catch {
      return null;
    }
  }

  remove(id: string): void {
    this.api.remove(id);
  }
}

/** 환경에 맞는 저장소 선택: Electron이면 SQLite, 아니면 localStorage. */
export function createSaveStore(): SaveStore {
  const api = (globalThis as { saveAPI?: SaveApi }).saveAPI;
  return api ? new ElectronSaveStore(api) : new WebSaveStore(window.localStorage);
}
