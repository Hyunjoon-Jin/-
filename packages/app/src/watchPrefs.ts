/**
 * 관전 설정(경기 개입 개선 M1 — A5/A8): 배속과 주요 이벤트 자동 일시정지 토글을
 * 저장해 다음 경기에도 유지한다. 손상된 저장값은 조용히 기본값으로 대체한다.
 */
export type WatchSpeed = 0.5 | 1 | 2 | 4 | 8;
export const WATCH_SPEEDS: readonly WatchSpeed[] = [0.5, 1, 2, 4, 8];

/** 관전 모드(M6 A6): full = 전 구간 실시간, highlight = 장면 사이 자동 스킵. */
export type WatchMode = 'full' | 'highlight';

export interface WatchPrefs {
  speed: WatchSpeed;
  /** 골이 터지면 자동 일시정지 — 전술을 다시 생각할 시간을 시스템이 마련한다. */
  pauseOnGoal: boolean;
  /** 카드(옐로/레드)가 나오면 자동 일시정지. */
  pauseOnCard: boolean;
  /** 관전 모드(A6) — 하이라이트 모드는 조용한 구간을 자동으로 건너뛴다. */
  mode: WatchMode;
}

const KEY = 'st_watch_prefs';
const DEFAULTS: WatchPrefs = { speed: 1, pauseOnGoal: true, pauseOnCard: false, mode: 'full' };

export function loadWatchPrefs(storage: Storage = window.localStorage): WatchPrefs {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<WatchPrefs>;
    return {
      speed: WATCH_SPEEDS.includes(p.speed as WatchSpeed) ? (p.speed as WatchSpeed) : DEFAULTS.speed,
      pauseOnGoal: typeof p.pauseOnGoal === 'boolean' ? p.pauseOnGoal : DEFAULTS.pauseOnGoal,
      pauseOnCard: typeof p.pauseOnCard === 'boolean' ? p.pauseOnCard : DEFAULTS.pauseOnCard,
      mode: p.mode === 'highlight' ? 'highlight' : DEFAULTS.mode,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveWatchPrefs(prefs: WatchPrefs, storage: Storage = window.localStorage): void {
  try {
    storage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // 저장 실패(프라이빗 모드 등)는 무시 — 설정은 세션 안에서만 유지된다.
  }
}
