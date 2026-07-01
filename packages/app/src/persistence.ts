/**
 * 세이브 직렬화 (저장소 독립).
 * GameState ↔ 순수 JSON(SaveFile) 변환. 버전 필드로 마이그레이션 대비.
 *
 * 핵심: SeasonSummary.finance 는 Map<string, ...> 이라 JSON.stringify 로
 * 직렬화되지 않는다 → 저장 시 객체로, 로드 시 Map 으로 변환한다.
 * 이 포맷은 저장소(localStorage / 추후 Electron SQLite)와 무관하게 동일.
 */
import type { GameState } from './game.js';
import type { SeasonSummary, SeasonFinanceReport } from '@soccer-tycoon/engine';

// v2~v11 …, v12: 사기·재계약(Player.seasonApps)
export const SAVE_VERSION = 12;

type SerializedSummary = Omit<SeasonSummary, 'finance'> & {
  finance: Record<string, SeasonFinanceReport>;
};

export interface SerializedGameState extends Omit<GameState, 'history'> {
  history: SerializedSummary[];
}

export interface SaveFile {
  version: number;
  savedAt: string;
  state: SerializedGameState;
}

export function serialize(state: GameState): SaveFile {
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    state: {
      ...state,
      history: state.history.map((s) => ({
        ...s,
        finance: Object.fromEntries(s.finance),
      })),
    },
  };
}

export function deserialize(file: SaveFile): GameState {
  if (file.version !== SAVE_VERSION) {
    throw new Error(`지원하지 않는 세이브 버전: ${file.version} (현재 ${SAVE_VERSION})`);
  }
  return {
    ...file.state,
    history: file.state.history.map((s) => ({
      ...s,
      finance: new Map(Object.entries(s.finance)),
    })),
  };
}
