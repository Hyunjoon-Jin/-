/**
 * UI ↔ 엔진 어댑터.
 * 엔진은 clubs 객체를 직접 변경(mutate)하므로, React 갱신을 위해
 * advance 후 새로운 GameState 래퍼 객체를 돌려준다.
 */
import {
  generateClub, advanceSeason, Rng,
  type Club, type SeasonSummary,
} from '@soccer-tycoon/engine';

export interface GameState {
  seed: number;
  clubs: Club[];
  myClubId: string;
  /** 다음에 진행할 시즌 번호 (1부터). */
  season: number;
  history: SeasonSummary[];
}

const N_CLUBS = 12;

/** 시작 화면용: 선택 가능한 구단 목록(생성 후). */
export function createLeague(seed: number): Club[] {
  const rng = new Rng(seed);
  const clubs: Club[] = [];
  for (let i = 0; i < N_CLUBS; i++) {
    const tier = 8 + Math.round((i / (N_CLUBS - 1)) * 8);
    clubs.push(generateClub(rng, `c${i}`, clubName(i), tier));
  }
  return clubs;
}

const NAMES = [
  'FC 서울리온', '부산 유나이티드', '대구 다이너모', '인천 아틀레틱',
  '광주 시티', '수원 로버스', '울산 스파르탄', '전주 레인저스',
  '제주 위너스', '창원 캐슬', '청주 코메츠', '강릉 포레스트',
];
function clubName(i: number): string {
  return NAMES[i] ?? `Club ${i + 1}`;
}

export function startGame(seed: number, myClubId: string): GameState {
  return { seed, clubs: createLeague(seed), myClubId, season: 1, history: [] };
}

/** 한 시즌 진행. 엔진이 clubs를 변경하고, 새 래퍼를 반환한다. */
export function advance(state: GameState): GameState {
  const summary = advanceSeason(state.clubs, state.season, state.seed + state.season * 1000);
  return {
    ...state,
    season: state.season + 1,
    history: [...state.history, summary],
  };
}

export function myClub(state: GameState): Club {
  return state.clubs.find((c) => c.id === state.myClubId)!;
}

export function lastSummary(state: GameState): SeasonSummary | undefined {
  return state.history[state.history.length - 1];
}

/** 내 구단의 최근 시즌 최종 순위(1-index). 없으면 undefined. */
export function myLastPosition(state: GameState): number | undefined {
  const s = lastSummary(state);
  if (!s) return undefined;
  const idx = s.table.findIndex((r) => r.clubId === state.myClubId);
  return idx >= 0 ? idx + 1 : undefined;
}
