/**
 * UI ↔ 엔진 어댑터.
 * 시즌을 경기 단위로 진행한다: 프리시즌 → 킥오프(이적) → 라운드 진행 → 시즌 종료(정산·성장).
 * 엔진이 clubs를 직접 변경하므로, 각 동작 후 새 GameState 래퍼를 돌려준다.
 */
import {
  generateClub, runTransferWindow, runOffseason, settleSeason, Rng,
  createSeasonState, playRound as enginePlayRound, playToEnd, computeTable, totalRounds, currentRound,
  commitResult, simulateMatch, defaultTactic, applyMatchEffects,
  buyPlayer, sellPlayer, releasePlayer,
  summarizeStats, aggregatePlayerStats, topScorers as engineTopScorers,
  createCup, playCupRound as enginePlayCupRound, playCupToEnd, isCupOver,
  upgradeStaff as engineUpgradeStaff, formatMoney,
  type Club, type Tactic, type MatchResult, type MatchSetup, type SeasonSummary,
  type Fixture, type TableRow, type PlayerSeasonStat, type CupState, type StaffKind,
} from '@soccer-tycoon/engine';
import { makeDefaultTactic, repairTactic } from './tactics.js';

/** 진행 중 시즌 스냅샷 (clubs는 GameState가 보유하므로 제외 → 직렬화 중복 방지). */
export interface LiveSeason {
  fixtures: Fixture[];
  results: MatchResult[];
  cursor: number;
  baseSeed: number;
  /** 이 시즌 킥오프 때 발생한 이적(시즌 종료 요약에 사용). */
  transfers: SeasonSummary['transfers'];
}

export interface GameState {
  seed: number;
  clubs: Club[];
  myClubId: string;
  season: number;
  history: SeasonSummary[];
  /** clubId → 전술. 최소한 내 구단. AI는 기본 전술. */
  tactics: Record<string, Tactic>;
  /** 진행 중 시즌. null = 프리시즌. */
  live: LiveSeason | null;
  /** 병행 컵대회. null = 미진행. */
  cup: CupState | null;
}

/** 컵 우승 상금 (만원). */
const CUP_PRIZE = 30_000;

const N_CLUBS = 12;

const NAMES = [
  'FC 서울리온', '부산 유나이티드', '대구 다이너모', '인천 아틀레틱',
  '광주 시티', '수원 로버스', '울산 스파르탄', '전주 레인저스',
  '제주 위너스', '창원 캐슬', '청주 코메츠', '강릉 포레스트',
];

export function createLeague(seed: number): Club[] {
  const rng = new Rng(seed);
  const clubs: Club[] = [];
  for (let i = 0; i < N_CLUBS; i++) {
    const tier = 8 + Math.round((i / (N_CLUBS - 1)) * 8);
    clubs.push(generateClub(rng, `c${i}`, NAMES[i] ?? `Club ${i + 1}`, tier));
  }
  return clubs;
}

export function startGame(seed: number, myClubId: string): GameState {
  const clubs = createLeague(seed);
  const mine = clubs.find((c) => c.id === myClubId)!;
  return {
    seed, clubs, myClubId, season: 1, history: [],
    tactics: { [myClubId]: makeDefaultTactic(mine) },
    live: null,
    cup: null,
  };
}

export function myClub(state: GameState): Club {
  return state.clubs.find((c) => c.id === state.myClubId)!;
}

export function myTactic(state: GameState): Tactic {
  return state.tactics[state.myClubId]!;
}

// ── 시드 파생 (재현성) ──
const transferSeed = (s: GameState) => s.seed + s.season * 1000 + 1;
const seasonSeed = (s: GameState) => s.seed + s.season * 1000 + 2;
const offseasonSeed = (s: GameState) => s.seed + s.season * 1000 + 3;

/** live 스냅샷 → 엔진 SeasonState 복원 (clubs 부착). */
function toSeasonState(state: GameState) {
  const live = state.live!;
  return {
    clubs: state.clubs,
    fixtures: live.fixtures,
    results: live.results,
    cursor: live.cursor,
    baseSeed: live.baseSeed,
  };
}

function tacticMap(state: GameState): Map<string, Tactic> {
  return new Map([[state.myClubId, myTactic(state)]]);
}

/** 프리시즌 → 킥오프: 이적 창 실행 후 일정 생성. */
export function startSeason(state: GameState): GameState {
  // 내 구단은 AI 매매에서 제외(직접 관리)
  const transfers = runTransferWindow(state.clubs, transferSeed(state), state.myClubId);
  // 이적으로 다른 구단 구성이 바뀌어도 내 라인업만 보정하면 됨
  const repaired = repairTactic(myClub(state), myTactic(state));
  const ss = createSeasonState(state.clubs, seasonSeed(state));
  const cup = createCup(state.clubs, state.seed + state.season * 1000 + 4);
  return {
    ...state,
    tactics: { ...state.tactics, [state.myClubId]: repaired },
    live: { fixtures: ss.fixtures, results: ss.results, cursor: ss.cursor, baseSeed: ss.baseSeed, transfers },
    cup,
  };
}

/** 컵 다음 라운드 진행 (선수 상태도 변동). */
export function playCupRound(state: GameState): GameState {
  if (!state.cup || isCupOver(state.cup)) return state;
  const cup = enginePlayCupRound(state.cup, state.clubs, tacticMap(state));
  return { ...state, cup };
}

/** 현재 라운드 진행. */
export function playRound(state: GameState): GameState {
  if (!state.live) return state;
  const ss = toSeasonState(state);
  enginePlayRound(ss, tacticMap(state));
  return { ...state, live: { ...state.live, results: ss.results, cursor: ss.cursor } };
}

/** 남은 모든 경기 진행. */
export function playRestOfSeason(state: GameState): GameState {
  if (!state.live) return state;
  const ss = toSeasonState(state);
  playToEnd(ss, tacticMap(state));
  return { ...state, live: { ...state.live, results: ss.results, cursor: ss.cursor } };
}

/** 시즌 종료: 정산 + 오프시즌(성장·은퇴) + 요약 기록 → 다음 시즌 프리시즌. */
export function finishSeason(state: GameState): GameState {
  if (!state.live) return state;
  const ss = toSeasonState(state);
  playToEnd(ss, tacticMap(state));
  const table = computeTable(ss);
  const { topScorers, awards } = summarizeStats(ss.results, totalRounds(ss));

  const finance = new Map();
  table.forEach((row, pos) => {
    const club = state.clubs.find((c) => c.id === row.clubId)!;
    finance.set(club.id, settleSeason(club, pos, state.clubs.length));
  });

  // 컵 자동 완료 + 우승 상금
  let cupChampionId: string | undefined;
  let cupChampionName: string | undefined;
  if (state.cup) {
    const finishedCup = playCupToEnd(state.cup, state.clubs, tacticMap(state));
    if (finishedCup.championId) {
      cupChampionId = finishedCup.championId;
      const champClub = state.clubs.find((c) => c.id === finishedCup.championId);
      cupChampionName = champClub?.name;
      if (champClub) {
        champClub.finance.balance += CUP_PRIZE;
        champClub.finance.transferBudget += CUP_PRIZE;
      }
    }
  }

  const retirements = runOffseason(state.clubs, new Rng(offseasonSeed(state)));
  const champ = table[0]!;
  const summary: SeasonSummary = {
    season: state.season,
    table,
    championId: champ.clubId,
    championName: champ.name,
    transfers: state.live.transfers,
    finance,
    retirements,
    topScorers,
    awards,
    cupChampionId,
    cupChampionName,
  };

  // 오프시즌으로 스쿼드가 바뀌었으니 라인업 보정
  const repaired = repairTactic(myClub(state), myTactic(state));
  return {
    ...state,
    season: state.season + 1,
    history: [...state.history, summary],
    tactics: { ...state.tactics, [state.myClubId]: repaired },
    live: null,
    cup: null,
  };
}

export function setMyTactic(state: GameState, tactic: Tactic): GameState {
  return { ...state, tactics: { ...state.tactics, [state.myClubId]: tactic } };
}

/** 프리시즌에서 한 시즌 전체를 한 번에 진행(킥오프→전 경기→정산). */
export function advanceFullSeason(state: GameState): GameState {
  return finishSeason(playRestOfSeason(startSeason(state)));
}

// ── 직접 이적 (프리시즌에만) ──────────────────────────────

export interface ActionOutcome { state: GameState; ok: boolean; message: string }

/** 스쿼드 변동 후 라인업 보정 + 새 래퍼. */
function afterSquadChange(state: GameState): GameState {
  const repaired = repairTactic(myClub(state), myTactic(state));
  return { ...state, tactics: { ...state.tactics, [state.myClubId]: repaired } };
}

export function buy(state: GameState, playerId: string): ActionOutcome {
  if (state.live) return { state, ok: false, message: '이적은 프리시즌에만 가능합니다.' };
  const r = buyPlayer(state.clubs, state.myClubId, playerId);
  if (!r.ok) return { state, ok: false, message: r.reason! };
  return { state: afterSquadChange(state), ok: true, message: `${r.playerName} 영입 완료` };
}

export function sell(state: GameState, playerId: string): ActionOutcome {
  if (state.live) return { state, ok: false, message: '이적은 프리시즌에만 가능합니다.' };
  const r = sellPlayer(state.clubs, state.myClubId, playerId);
  if (!r.ok) return { state, ok: false, message: r.reason! };
  return { state: afterSquadChange(state), ok: true, message: `${r.playerName} → ${r.buyerName} 판매 완료` };
}

export function release(state: GameState, playerId: string): ActionOutcome {
  if (state.live) return { state, ok: false, message: '이적은 프리시즌에만 가능합니다.' };
  const r = releasePlayer(state.clubs, state.myClubId, playerId);
  if (!r.ok) return { state, ok: false, message: r.reason! };
  return { state: afterSquadChange(state), ok: true, message: `${r.playerName} 방출 완료` };
}

const STAFF_LABEL: Record<string, string> = { coaching: '코칭', medical: '의료', scouting: '스카우팅' };

/** 스태프 업그레이드 (보유 자금 사용). */
export function upgradeStaffAction(state: GameState, kind: string): ActionOutcome {
  const r = engineUpgradeStaff(myClub(state), kind as StaffKind);
  if (!r.ok) return { state, ok: false, message: r.reason! };
  return {
    state: { ...state },
    ok: true,
    message: `${STAFF_LABEL[kind]} Lv.${r.newLevel} (−${formatMoney(r.cost!)})`,
  };
}

// ── 조회 헬퍼 ──

export function liveTable(state: GameState): TableRow[] {
  if (!state.live) return [];
  return computeTable(toSeasonState(state));
}

export function liveProgress(state: GameState): { round: number; total: number; over: boolean } {
  if (!state.live) return { round: 0, total: 0, over: false };
  const ss = toSeasonState(state);
  const total = totalRounds(ss);
  const over = ss.cursor >= ss.fixtures.length;
  return { round: over ? total : currentRound(ss), total, over };
}

/** 내 구단의 다음 라운드 경기. */
export function myNextFixture(state: GameState): { fx: Fixture; opponent: Club; home: boolean } | null {
  if (!state.live) return null;
  const live = state.live;
  if (live.cursor >= live.fixtures.length) return null;
  const round = live.fixtures[live.cursor]!.round;
  const fx = live.fixtures.find(
    (f, i) => i >= live.cursor && f.round === round &&
      (f.homeId === state.myClubId || f.awayId === state.myClubId),
  );
  if (!fx) return null;
  const home = fx.homeId === state.myClubId;
  const opponent = state.clubs.find((c) => c.id === (home ? fx.awayId : fx.homeId))!;
  return { fx, opponent, home };
}

/** 진행 중 시즌의 리그 득점 순위(라이브). */
export function liveTopScorers(state: GameState, n = 10): PlayerSeasonStat[] {
  if (!state.live) return [];
  return engineTopScorers(aggregatePlayerStats(state.live.results), n);
}

/** 진행 중 시즌, 내 구단 선수들의 시즌 통계(평점순). */
export function liveSquadStats(state: GameState): PlayerSeasonStat[] {
  if (!state.live) return [];
  return aggregatePlayerStats(state.live.results)
    .filter((s) => s.clubId === state.myClubId)
    .sort((a, b) => b.avgRating - a.avgRating);
}

// ── 경기 관전 (라이브 + 하프타임 개입) ──────────────────────

export interface WatchSetup {
  setup: MatchSetup;
  userIsHome: boolean;
  opponent: Club;
}

/** 현재 라운드 내 사용자 경기를 라이브로 관전하기 위한 셋업. */
export function watchSetup(state: GameState): WatchSetup | null {
  if (!state.live) return null;
  const live = state.live;
  if (live.cursor >= live.fixtures.length) return null;
  const round = live.fixtures[live.cursor]!.round;

  let idx = -1;
  for (let i = live.cursor; i < live.fixtures.length && live.fixtures[i]!.round === round; i++) {
    const f = live.fixtures[i]!;
    if (f.homeId === state.myClubId || f.awayId === state.myClubId) { idx = i; break; }
  }
  if (idx < 0) return null;

  const fx = live.fixtures[idx]!;
  const clubById = (id: string) => state.clubs.find((c) => c.id === id)!;
  const homeClub = clubById(fx.homeId);
  const awayClub = clubById(fx.awayId);
  const userIsHome = fx.homeId === state.myClubId;
  const userTactic = myTactic(state);
  const setup: MatchSetup = {
    home: { club: homeClub, tactic: userIsHome ? userTactic : defaultTactic(homeClub) },
    away: { club: awayClub, tactic: userIsHome ? defaultTactic(awayClub) : userTactic },
    seed: live.baseSeed + idx,
  };
  return { setup, userIsHome, opponent: userIsHome ? awayClub : homeClub };
}

/**
 * 관전한 사용자 경기 결과로 현재 라운드 전체를 커밋.
 * 다른 경기는 일괄 시뮬(기본 전술), 사용자 경기는 watched 결과를 fixture 순서대로 주입.
 */
export function commitWatchedRound(state: GameState, watched: MatchResult): GameState {
  if (!state.live) return state;
  const ss = toSeasonState(state);
  if (ss.cursor >= ss.fixtures.length) return state;
  const round = ss.fixtures[ss.cursor]!.round;
  const clubById = (id: string) => state.clubs.find((c) => c.id === id)!;

  const userTactic = myTactic(state);
  while (ss.cursor < ss.fixtures.length && ss.fixtures[ss.cursor]!.round === round) {
    const fx = ss.fixtures[ss.cursor]!;
    const homeClub = clubById(fx.homeId);
    const awayClub = clubById(fx.awayId);
    const isUser = fx.homeId === state.myClubId || fx.awayId === state.myClubId;
    const homeTactic = fx.homeId === state.myClubId ? userTactic : defaultTactic(homeClub);
    const awayTactic = fx.awayId === state.myClubId ? userTactic : defaultTactic(awayClub);
    const result = isUser
      ? watched
      : simulateMatch({
          home: { club: homeClub, tactic: homeTactic },
          away: { club: awayClub, tactic: awayTactic },
          seed: ss.baseSeed + ss.cursor,
        });
    // playNext와 동일한 난수 스킴으로 상태 변화 반영(관전/자동 일관성)
    applyMatchEffects(homeClub, homeTactic, awayClub, awayTactic, result,
      new Rng(ss.baseSeed * 2 + ss.cursor + 7919));
    commitResult(ss, result);
  }
  return { ...state, live: { ...state.live, results: ss.results, cursor: ss.cursor } };
}

export function lastSummary(state: GameState): SeasonSummary | undefined {
  return state.history[state.history.length - 1];
}

export function myLastPosition(state: GameState): number | undefined {
  const s = lastSummary(state);
  if (!s) return undefined;
  const idx = s.table.findIndex((r) => r.clubId === state.myClubId);
  return idx >= 0 ? idx + 1 : undefined;
}
