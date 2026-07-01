/**
 * UI ↔ 엔진 어댑터.
 * 시즌을 경기 단위로 진행한다: 프리시즌 → 킥오프(이적) → 라운드 진행 → 시즌 종료(정산·성장).
 * 엔진이 clubs를 직접 변경하므로, 각 동작 후 새 GameState 래퍼를 돌려준다.
 */
import {
  generateClub, runTransferWindow, runOffseason, settleSeason, Rng,
  createSeasonState, playRound as enginePlayRound, playToEnd, computeTable, totalRounds, currentRound,
  commitResult, simulateMatch, simulateSeason, defaultTactic, applyMatchEffects,
  buyPlayer, buyPlayerAt, evaluateOffer, sellPlayer, releasePlayer,
  sellOffers, acceptSellOffer,
  type OfferEvaluation, type SellOffer,
  summarizeStats, aggregatePlayerStats, topScorers as engineTopScorers,
  createCup, playCupRound as enginePlayCupRound, playCupToEnd, isCupOver,
  applyPromotionRelegation, clubsInDivision, runInternationalBreak,
  confidenceDelta, applyConfidence, isSacked, START_CONFIDENCE,
  upgradeStaff as engineUpgradeStaff, formatMoney,
  computeTeamStrength, currentAbility, recentForm,
  type Club, type Tactic, type MatchResult, type MatchSetup, type SeasonSummary,
  type Fixture, type TableRow, type PlayerSeasonStat, type CupState, type StaffKind,
  type TeamStrength, type FormSummary,
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
  /** 이 시즌 내 구단이 속한 부의 구단 id들(순서 고정). */
  divisionClubIds: string[];
}

export const DIVISIONS = 2;
export const CLUBS_PER_DIV = 12;
export const PROMOTE_COUNT = 3;
export const DIVISION_LABELS = ['1부', '2부'];

export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTIES: Record<Difficulty, {
  label: string; financeMul: number; budgetMul: number; targetOffset: number; desc: string;
}> = {
  easy: { label: '쉬움', financeMul: 1.6, budgetMul: 1.8, targetOffset: 3, desc: '넉넉한 자금, 완화된 목표' },
  normal: { label: '보통', financeMul: 1.0, budgetMul: 1.0, targetOffset: 0, desc: '기본 밸런스' },
  hard: { label: '어려움', financeMul: 0.6, budgetMul: 0.5, targetOffset: -2, desc: '빠듯한 자금, 높은 기대치' },
};

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
  /** 난이도. */
  difficulty: Difficulty;
  /** 보드진 시즌 목표(리그 최종 순위, 1-index). 이 순위 이내면 성공. */
  objective: number;
  /** 이사회 신뢰도(0~100). 시즌 성적으로 변동, 바닥나면 경질. */
  boardConfidence: number;
  /** 경질 여부(게임 오버). 신뢰도가 하한 미만이 되면 설정. */
  sacked?: boolean;
}

/** 컵 우승 상금 (만원). */
const CUP_PRIZE = 30_000;

const NAMES = [
  // 1부
  'FC 서울리온', '부산 유나이티드', '대구 다이너모', '인천 아틀레틱',
  '광주 시티', '수원 로버스', '울산 스파르탄', '전주 레인저스',
  '제주 위너스', '창원 캐슬', '청주 코메츠', '강릉 포레스트',
  // 2부
  '고양 그리핀', '천안 세이버스', '포항 타이드', '김해 팰컨스',
  '원주 울브스', '안양 브레이커스', '진주 코르사', '목포 마리너스',
  '춘천 아이스', '여수 오션', '군산 게일스', '충주 스톤즈',
];

/** 24개 구단, 2개 부(각 12팀). 1부가 2부보다 전력·평판이 높다. */
export function createLeague(seed: number): Club[] {
  const rng = new Rng(seed);
  const clubs: Club[] = [];
  for (let d = 0; d < DIVISIONS; d++) {
    for (let i = 0; i < CLUBS_PER_DIV; i++) {
      // 1부: tier 10~16, 2부: tier 6~12
      const base = d === 0 ? 10 : 6;
      const tier = base + Math.round((i / (CLUBS_PER_DIV - 1)) * 6);
      const idx = d * CLUBS_PER_DIV + i;
      clubs.push(generateClub(rng, `c${idx}`, NAMES[idx] ?? `Club ${idx + 1}`, tier, d));
    }
  }
  return clubs;
}

/** 부 목표: 2부=승격(상위), 1부=잔류(하위권 회피). 난이도로 조정. */
function divisionObjective(division: number, difficulty: Difficulty): number {
  const off = DIFFICULTIES[difficulty].targetOffset;
  const base = division === 1 ? PROMOTE_COUNT : CLUBS_PER_DIV - PROMOTE_COUNT; // 2부:3위, 1부:9위
  return Math.max(1, Math.min(CLUBS_PER_DIV, base + off));
}

export function myDivision(state: GameState): number {
  return myClub(state).division;
}

export function divisionClubs(state: GameState, division: number): Club[] {
  return clubsInDivision(state.clubs, division);
}

export function startGame(seed: number, myClubId: string, difficulty: Difficulty = 'normal'): GameState {
  const clubs = createLeague(seed);
  const mine = clubs.find((c) => c.id === myClubId)!;
  const cfg = DIFFICULTIES[difficulty];

  // 난이도로 내 구단 재정 조정 (AI는 그대로)
  mine.finance.balance = Math.round(mine.finance.balance * cfg.financeMul);
  mine.finance.transferBudget = Math.round(mine.finance.transferBudget * cfg.budgetMul);

  // 보드진 목표: 소속 부에 따른 승격/잔류 목표
  const objective = divisionObjective(mine.division, difficulty);

  return {
    seed, clubs, myClubId, season: 1, history: [],
    tactics: { [myClubId]: makeDefaultTactic(mine) },
    live: null,
    cup: null,
    difficulty,
    objective,
    boardConfidence: START_CONFIDENCE,
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

/** live 스냅샷 → 엔진 SeasonState 복원 (내 부 구단만 부착). */
function toSeasonState(state: GameState) {
  const live = state.live!;
  const byId = new Map(state.clubs.map((c) => [c.id, c]));
  const clubs = live.divisionClubIds.map((id) => byId.get(id)!);
  return {
    clubs,
    fixtures: live.fixtures,
    results: live.results,
    cursor: live.cursor,
    baseSeed: live.baseSeed,
  };
}

function tacticMap(state: GameState): Map<string, Tactic> {
  return new Map([[state.myClubId, myTactic(state)]]);
}

/** 프리시즌 → 킥오프: 이적 창 실행 후 내 부 일정 생성 (컵은 전 구단). */
export function startSeason(state: GameState): GameState {
  // 이적은 전 구단 대상(내 구단 제외)
  const transfers = runTransferWindow(state.clubs, transferSeed(state), state.myClubId);
  const repaired = repairTactic(myClub(state), myTactic(state));
  // 내 부 리그 일정
  const myDivClubs = divisionClubs(state, myDivision(state));
  const ss = createSeasonState(myDivClubs, seasonSeed(state));
  // 컵은 전 구단 참가
  const cup = createCup(state.clubs, state.seed + state.season * 1000 + 4);
  return {
    ...state,
    tactics: { ...state.tactics, [state.myClubId]: repaired },
    live: {
      fixtures: ss.fixtures, results: ss.results, cursor: ss.cursor, baseSeed: ss.baseSeed,
      transfers, divisionClubIds: myDivClubs.map((c) => c.id),
    },
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

/** 시즌 종료: 내 부 완주 + 상대 부 자동 시뮬 + 정산 + 오프시즌 + 승강 → 다음 프리시즌. */
export function finishSeason(state: GameState): GameState {
  if (!state.live) return state;
  const myDiv = myDivision(state);

  // 1) 내 부 완주
  const ss = toSeasonState(state);
  playToEnd(ss, tacticMap(state));
  const myTable = computeTable(ss);
  const { topScorers, awards } = summarizeStats(ss.results, totalRounds(ss));

  // 2) 상대 부 자동 시뮬 (통계엔 미포함, 순위/정산/승강용)
  const otherDiv = myDiv === 0 ? 1 : 0;
  const otherClubs = divisionClubs(state, otherDiv);
  const otherResult = simulateSeason(otherClubs, seasonSeed(state) + 5000);
  const otherTable = otherResult.table;

  // 3) 정산 (부별 순위 기준)
  const finance = new Map();
  myTable.forEach((row, pos) => {
    const club = state.clubs.find((c) => c.id === row.clubId)!;
    finance.set(club.id, settleSeason(club, pos, CLUBS_PER_DIV));
  });
  otherTable.forEach((row, pos) => {
    const club = state.clubs.find((c) => c.id === row.clubId)!;
    finance.set(club.id, settleSeason(club, pos, CLUBS_PER_DIV));
  });

  // 4) 컵 자동 완료 + 우승 상금 (전 구단)
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

  // 5) 오프시즌 (전 구단)
  const { retirements, intakeByClub, fireSalesByClub } = runOffseason(state.clubs, new Rng(offseasonSeed(state)));

  // 5.5) 국가대표 차출 (오프시즌 리셋 이후 — 피로/부상이 새 시즌에 반영)
  const intl = runInternationalBreak(state.clubs, new Rng(offseasonSeed(state) + 777));
  const myCallUps = intl.byClub.get(state.myClubId) ?? 0;
  const myIntlInjuries = myClub(state).players.filter((p) => p.injuryMatches > 0).length;

  // 6) 승강 (1부↔2부)
  const d1Table = myDiv === 0 ? myTable : otherTable;
  const d2Table = myDiv === 1 ? myTable : otherTable;
  const promRel = applyPromotionRelegation(state.clubs, d1Table, d2Table, PROMOTE_COUNT);
  const promoted = promRel.promoted.includes(state.myClubId);
  const relegated = promRel.relegated.includes(state.myClubId);

  // 6.5) 이사회 신뢰도 갱신 (이번 시즌 목표 대비 성적 + 승강 + 재정)
  const myPosition = myTable.findIndex((r) => r.clubId === state.myClubId) + 1;
  const myNet = finance.get(state.myClubId)?.net ?? 0;
  const delta = confidenceDelta({
    position: myPosition, objective: state.objective, promoted, relegated, netFinance: myNet,
  });
  const boardConfidence = applyConfidence(state.boardConfidence, delta);
  const sacked = isSacked(boardConfidence);

  const champ = myTable[0]!;
  const summary: SeasonSummary = {
    season: state.season,
    table: myTable,
    championId: champ.clubId,
    championName: champ.name,
    transfers: state.live.transfers,
    finance,
    retirements,
    youthPromotions: intakeByClub.get(state.myClubId),
    fireSales: fireSalesByClub.get(state.myClubId),
    topScorers,
    awards,
    cupChampionId,
    cupChampionName,
    division: myDiv,
    promoted,
    relegated,
    nationalCallUps: myCallUps,
    nationalInjuries: myIntlInjuries,
  };

  const repaired = repairTactic(myClub(state), myTactic(state));
  return {
    ...state,
    season: state.season + 1,
    history: [...state.history, summary],
    tactics: { ...state.tactics, [state.myClubId]: repaired },
    // 새 부 기준으로 목표 재설정
    objective: divisionObjective(myClub(state).division, state.difficulty),
    boardConfidence,
    sacked,
    live: null,
    cup: null,
  };
}

export function setMyTactic(state: GameState, tactic: Tactic): GameState {
  return { ...state, tactics: { ...state.tactics, [state.myClubId]: tactic } };
}

/** 내 선수 재계약 (계약 연장 + 임금 인상 + 사기 상승, 계약금 지출). */
export function renewContract(state: GameState, playerId: string): ActionOutcome {
  const club = myClub(state);
  const p = club.players.find((pl) => pl.id === playerId);
  if (!p) return { state, ok: false, message: '선수를 찾을 수 없습니다.' };
  if (p.contractYears > 2) return { state, ok: false, message: '아직 재계약이 필요하지 않습니다.' };
  const cost = Math.round(p.wage * 20);
  if (club.finance.balance < cost) return { state, ok: false, message: '자금이 부족합니다.' };
  club.finance.balance -= cost;
  p.contractYears = 4;
  p.wage = Math.round(p.wage * 1.1);
  p.morale = Math.min(1, p.morale + 0.15);
  return { state: { ...state }, ok: true, message: `${p.name} 재계약 완료 (계약금 ${formatMoney(cost)})` };
}

/** 내 선수의 훈련 포커스 설정. */
export function setTrainingFocus(
  state: GameState, playerId: string, focus: import('@soccer-tycoon/engine').TrainingFocus,
): GameState {
  const p = myClub(state).players.find((pl) => pl.id === playerId);
  if (p) p.trainingFocus = focus;
  return { ...state };
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

/** 이적 협상: 제안액에 대한 매도 구단 반응(수락/역제안/거절). 상태 변경 없음. */
export function negotiate(state: GameState, playerId: string, offer: number): OfferEvaluation {
  if (state.live) return { ok: false, reason: '이적은 프리시즌에만 가능합니다.' };
  return evaluateOffer(state.clubs, state.myClubId, playerId, offer);
}

/** 합의된 이적료로 영입 실행(협상 타결). */
export function buyAt(state: GameState, playerId: string, fee: number): ActionOutcome {
  if (state.live) return { state, ok: false, message: '이적은 프리시즌에만 가능합니다.' };
  const r = buyPlayerAt(state.clubs, state.myClubId, playerId, fee);
  if (!r.ok) return { state, ok: false, message: r.reason! };
  return { state: afterSquadChange(state), ok: true, message: `${r.playerName} 영입 완료 (${formatMoney(r.fee!)})` };
}

export function sell(state: GameState, playerId: string): ActionOutcome {
  if (state.live) return { state, ok: false, message: '이적은 프리시즌에만 가능합니다.' };
  const r = sellPlayer(state.clubs, state.myClubId, playerId);
  if (!r.ok) return { state, ok: false, message: r.reason! };
  return { state: afterSquadChange(state), ok: true, message: `${r.playerName} → ${r.buyerName} 판매 완료` };
}

/** 내 선수에 대한 AI 구단 입찰 목록(상태 변경 없음). */
export function offersFor(state: GameState, playerId: string): SellOffer[] {
  if (state.live) return [];
  return sellOffers(state.clubs, state.myClubId, playerId);
}

/** 특정 구단 입찰 수락 → 판매 실행. */
export function acceptSell(state: GameState, playerId: string, buyerId: string): ActionOutcome {
  if (state.live) return { state, ok: false, message: '이적은 프리시즌에만 가능합니다.' };
  const r = acceptSellOffer(state.clubs, state.myClubId, playerId, buyerId);
  if (!r.ok) return { state, ok: false, message: r.reason! };
  return {
    state: afterSquadChange(state), ok: true,
    message: `${r.playerName} → ${r.buyerName} 판매 완료 (${formatMoney(r.fee!)})`,
  };
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

// ── 경기 프리뷰 (관전 전 스카우팅) ──────────────────────────

export interface TeamPreview {
  clubId: string;
  name: string;
  isMine: boolean;
  /** 현재 리그 순위(1부터). 결과가 없으면 null. */
  position: number | null;
  strength: TeamStrength;
  form: FormSummary;
  /** 예상 선발 중 CA 최고 선수. */
  keyPlayer: { name: string; ca: number } | null;
}

export interface MatchPreview {
  home: TeamPreview;
  away: TeamPreview;
}

/** 선발(전술 라인업) 중 현재 능력 최고 선수. */
function keyPlayerOf(club: Club, tactic: Tactic): { name: string; ca: number } | null {
  const byId = new Map(club.players.map((p) => [p.id, p]));
  let best: { name: string; ca: number } | null = null;
  for (const slot of tactic.lineup) {
    const p = byId.get(slot.playerId);
    if (!p) continue;
    const ca = Math.round(currentAbility(p));
    if (!best || ca > best.ca) best = { name: p.name, ca };
  }
  return best;
}

/** 관전 예정 경기의 프리뷰(전력·폼·순위·키플레이어). live·watchSetup 없으면 null. */
export function matchPreview(state: GameState): MatchPreview | null {
  const ws = watchSetup(state);
  if (!ws || !state.live) return null;
  const table = liveTable(state);
  const posOf = (clubId: string): number | null => {
    if (state.live!.results.length === 0) return null;
    const i = table.findIndex((r) => r.clubId === clubId);
    return i < 0 ? null : i + 1;
  };
  const build = (club: Club, tactic: Tactic): TeamPreview => ({
    clubId: club.id,
    name: club.name,
    isMine: club.id === state.myClubId,
    position: posOf(club.id),
    strength: computeTeamStrength(club, tactic),
    form: recentForm(state.live!.results, club.id, 5),
    keyPlayer: keyPlayerOf(club, tactic),
  });
  return {
    home: build(ws.setup.home.club, ws.setup.home.tactic),
    away: build(ws.setup.away.club, ws.setup.away.tactic),
  };
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
