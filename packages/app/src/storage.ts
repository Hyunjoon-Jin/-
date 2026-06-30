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
