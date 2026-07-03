/**
 * 감독 커리어 아카이브 — 세이브 슬롯과 독립적으로, 경질로 끝난 재임을 영구 기록한다.
 * localStorage를 직접 사용(웹/Electron 렌더러 모두 접근 가능 — 세이브 백엔드와 무관한 개인 기록).
 */
import type { GameState } from './game.js';

export interface CareerStint {
  clubName: string;
  /** 재임 시즌 수. */
  seasons: number;
  /** 재임 중 최고 순위(완료된 시즌이 없으면 undefined). */
  bestFinish?: number;
  leagueTitles: number;
  cupTitles: number;
  /** 경질된 시각(ISO). */
  endedAt: string;
}

const KEY = 'st_career';
/** 세이브와 별개로 세션(브라우저/기기)마다 영구 누적되는 기록이라 자연스러운 상한이
 *  없다 — localStorage 용량을 실제 세이브와 공유하므로 최근 N개로 캡한다. */
const MAX_STINTS = 50;

function readAll(storage: Storage): CareerStint[] {
  const raw = storage.getItem(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as CareerStint[];
  } catch {
    return [];
  }
}

/** 지금까지 경질로 끝난 모든 재임 기록(오래된 순). */
export function loadCareer(storage: Storage = window.localStorage): CareerStint[] {
  return readAll(storage);
}

/** 재임 상태로부터 스냅샷을 만들어 아카이브에 추가한다. 호출자는 경질 전이 시 1회만 호출해야 한다. */
export function recordSackedStint(state: GameState, storage: Storage = window.localStorage): CareerStint {
  const myId = state.myClubId;
  const clubName = state.clubs.find((c) => c.id === myId)?.name ?? '(알 수 없음)';
  const positions = state.history
    .map((s) => s.table.findIndex((r) => r.clubId === myId) + 1)
    .filter((p) => p > 0);
  const stint: CareerStint = {
    clubName,
    seasons: Math.max(0, state.season - 1),
    bestFinish: positions.length > 0 ? Math.min(...positions) : undefined,
    leagueTitles: state.history.filter((s) => s.championId === myId).length,
    cupTitles: state.history.filter((s) => s.cupChampionId === myId).length,
    endedAt: new Date().toISOString(),
  };
  const all = [...readAll(storage), stint];
  storage.setItem(KEY, JSON.stringify(all.length > MAX_STINTS ? all.slice(-MAX_STINTS) : all));
  return stint;
}
