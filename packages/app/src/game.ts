/**
 * UI ↔ 엔진 어댑터.
 * 시즌을 경기 단위로 진행한다: 프리시즌 → 킥오프(이적) → 라운드 진행 → 시즌 종료(정산·성장).
 * 엔진이 clubs를 직접 변경하므로, 각 동작 후 새 GameState 래퍼를 돌려준다.
 */
import {
  generateClub, runTransferWindow, runOffseason, settleSeason, Rng,
  createSeasonState, playRound as enginePlayRound, playToEnd, computeTable, totalRounds, currentRound,
  commitResult, simulateMatch, simulateSeason, defaultTactic, applyMatchEffects,
  buyPlayer, buyPlayerAt, buyPlayerViaReleaseClause, evaluateOffer, sellPlayer, releasePlayer,
  exerciseBuyback, attachAddOnClause, exerciseLoanBuyOption,
  agentRelationsOf, agentRelationsTier,
  AGENT_RELATIONS_MIN, AGENT_RELATIONS_DEFAULT, AGENT_RELATIONS_BREAKDOWN_PENALTY,
  panicBuy as enginePanicBuy, PANIC_BUY_PREMIUM, executeRivalSnipe,
  type AgentRelationsTier,
  sellOffers, acceptSellOffer,
  loanPlayerOut, recallLoanPlayer, applyLoanWageSubsidies, swapPlayers,
  type OfferEvaluation, type SellOffer, type LoanTerms, type LoanReturnEvent, type LoanObligationEvent,
  summarizeStats, aggregatePlayerStats, topScorers as engineTopScorers, recentPlayerForm,
  seasonSquadSnapshot,
  createCup, playCupRound as enginePlayCupRound, playCupToEnd, isCupOver, nextCupPairings,
  CUP_FINAL_ROUND_NAME,
  applyPromotionRelegation, clubsInDivision, runInternationalBreak,
  runInternationalTournament, TOURNAMENT_INTERVAL_SEASONS,
  confidenceDelta, applyConfidence, isSacked, START_CONFIDENCE, boardStatus, boardTierUpgradeBonus,
  type BoardStatus,
  generateDemand, evaluateDemand, demandConfidence, DEMAND_LABEL,
  generateSponsorGoal, evaluateSponsorGoal, SPONSOR_GOAL_LABEL, sponsorStreakMultiplier, type SponsorGoal,
  annualWageBill, wageBudget,
  matchOutcomeKind, mediaToneOptions, shouldTriggerMediaEvent, applyMediaTone,
  MEDIA_TONE_STYLE, classifyPersona,
  type BoardDemand, type RetiredLegend,
  type MediaEventKind, type MediaTone, type MediaToneOption, type ManagerPersona,
  upgradeStaff as engineUpgradeStaff, upgradeStadium as engineUpgradeStadium,
  upgradeAcademy as engineUpgradeAcademy, formatMoney,
  loyaltyDiscount,
  computeTeamStrength, currentAbility, recentForm, buildScoutingReport, lineOf,
  dispatchScout as engineDispatchScout,
  assignMentor as engineAssignMentor, clearMentorPairing as engineClearMentorPairing,
  type Club, type Tactic, type MatchResult, type MatchSetup, type SeasonSummary,
  type Fixture, type TableRow, type PlayerSeasonStat, type CupState, type StaffKind,
  type PlayerFormEntry, type Player, type YouthProspect, type YouthProspectUpdate,
  type TeamStrength, type FormSummary, type ScoutingReport, type Line, type StaffDepartureEvent,
  type AddOnEvent,
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
  /** 미디어 인터뷰를 처리(응답/무시)한 마지막 라운드(중복 노출 방지). */
  mediaHandledThroughRound: number;
  /** 시즌 시작 시 언론 예상 순위(전술 XI 평균 CA 기준, 킥오프 시점 고정). */
  predictedTable: PredictedClub[];
  /** 컵 참가 전 구단(24개)의 전력 순위(전술 XI 평균 CA 기준) — 우승 후보 예측용. */
  cupFavorites: PredictedClub[];
}

/** 언론 예상 순위 항목. */
export interface PredictedClub {
  clubId: string;
  name: string;
  predictedPos: number;
}

/** 전술 XI(출전 예정 라인업)의 평균 CA — 언론 예상 순위 산정용. */
function xiAvgCA(club: Club, tactic: Tactic): number {
  const byId = new Map(club.players.map((p) => [p.id, p]));
  const xi = tactic.lineup
    .map((s) => byId.get(s.playerId))
    .filter((p): p is Player => p !== undefined);
  if (xi.length === 0) return 0;
  return xi.reduce((s, p) => s + currentAbility(p), 0) / xi.length;
}

/** 프리시즌 언론 예상 순위: 전술 XI 평균 CA로 구단을 정렬(단순 전력 랭킹). */
function preseasonPrediction(clubs: Club[], myClubId: string, myClubTactic: Tactic): PredictedClub[] {
  return clubs
    .map((c) => ({
      clubId: c.id, name: c.name,
      rating: xiAvgCA(c, c.id === myClubId ? myClubTactic : defaultTactic(c)),
    }))
    .sort((a, b) => b.rating - a.rating)
    .map((r, i) => ({ clubId: r.clubId, name: r.name, predictedPos: i + 1 }));
}

/** 이변 판정 기준: 예상보다 이만큼 이상 순위가 차이 나면 이변으로 본다. */
const SURPRISE_GAP = 4;

function classifySurprise(predictedPos: number, actualPos: number): SeasonSummary['surprise'] {
  if (predictedPos - actualPos >= SURPRISE_GAP) return 'overperform';
  if (actualPos - predictedPos >= SURPRISE_GAP) return 'underperform';
  return undefined;
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
  /** 병행 대륙컵(D17) — 지난 시즌 1부 상위 성적 구단만 참가. null = 미진행(자격 구단 2개 미만 등). */
  continentalCup?: CupState | null;
  /** 다음 시즌 대륙컵에 참가할 구단 id(이번 시즌 1부 최종 순위 기준). */
  continentalQualifierIds?: string[];
  /** 난이도. */
  difficulty: Difficulty;
  /** 보드진 시즌 목표(리그 최종 순위, 1-index). 이 순위 이내면 성공. */
  objective: number;
  /** 이사회 신뢰도(0~100). 시즌 성적으로 변동, 바닥나면 경질. */
  boardConfidence: number;
  /** 경질 여부(게임 오버). 신뢰도가 하한 미만이 되면 설정. */
  sacked?: boolean;
  /** 이번 시즌 이사회 특별 요구(없을 수 있음). */
  demand?: BoardDemand | null;
  /** 이번 시즌 스폰서 보너스 목표(없을 수 있음). 달성 시 일시불 현금 보너스. */
  sponsorGoal?: SponsorGoal | null;
  /** 밀당이 결렬(roundsExhausted)된 선수 id → 재협상이 다시 가능해지는 시즌 번호
   *  (Item1). 매도 구단이 협상을 접은 채로 곧장 재제안하지 못하게 막아, "다음
   *  시즌에 다시 시도하세요" 안내가 실제로 지켜지도록 한다. */
  negotiationCooldowns?: Record<string, number>;
  /** 스폰서 보너스 목표 연속 달성 횟수(C-new2) — 목표가 주어진 시즌에 달성하면 +1,
   *  실패하면 0으로 리셋. 목표가 없는 시즌은 그대로 유지(불이익 없음). 구버전
   *  세이브는 없을 수 있어 optional(없으면 0 취급). */
  sponsorStreak?: number;
  /** 내 구단에서 뛰다 은퇴한 선수 아카이브(레전드). */
  legends: ClubLegend[];
  /** 라이벌 구단 id. 게임 시작 시 1회 고정(같은 부 내 평판이 가장 가까운 구단). */
  rivalClubId: string;
  /** 라이벌 구단전 통산 전적(내 구단 기준). */
  rivalRecord: RivalRecord;
  /** 라이벌 구단전 개별 맞대결 기록(시즌순). */
  rivalMeetings: RivalMeeting[];
  /** 미디어 인터뷰 톤별 누적 응답 횟수(감독 이미지 형성용). */
  mediaToneCounts: Record<MediaTone, number>;
  /** 감독 계약 잔여 시즌 수. 0(또는 이하)이 되면 대시보드에 계약 갱신 제안이 뜬다. */
  contractSeasonsLeft: number;
  /** 과거 장기 계약 체결 누적치 — 보드진 목표 순위를 영구적으로 더 엄격하게 만든다. */
  ambition: number;
  /** playerId → 내 구단 소속으로 뛴 시즌의 평균 평점 이력(최근 20시즌). 출전이 없던 시즌은 기록되지 않는다. */
  ratingHistory: Record<string, SeasonRatingEntry[]>;
}

/** 선수의 한 시즌 평균 평점 스냅샷. */
export interface SeasonRatingEntry {
  season: number;
  avgRating: number;
}

/** 새 게임 시작 시 감독 계약 기간(시즌). */
const CONTRACT_INITIAL_YEARS = 3;

/** 모든 톤 0으로 초기화된 카운트 맵. */
function emptyMediaToneCounts(): Record<MediaTone, number> {
  return {
    confident: 0, humble: 0, accountable: 0, blamePlayers: 0, blameRef: 0, satisfied: 0, frustrated: 0,
  };
}

/** 라이벌 구단전 개별 맞대결 기록. */
export interface RivalMeeting {
  season: number;
  home: boolean;
  myGoals: number;
  oppGoals: number;
  result: 'win' | 'draw' | 'loss';
  competition: 'league' | 'cup';
  /** 컵 맞대결이 승부차기로 결정됐는지(리그전은 항상 undefined). */
  penalties?: boolean;
}

/** 은퇴 스냅샷(RetiredLegend) + 은퇴한 시즌(내 구단 재임 기준). */
export interface ClubLegend extends RetiredLegend {
  season: number;
}

/** 라이벌 구단전 통산 전적. */
export interface RivalRecord {
  wins: number;
  draws: number;
  losses: number;
}

/** 컵 우승 상금 (만원). */
const CUP_PRIZE = 30_000;

/** 대륙컵 진출 구단 수(D17) — 매 시즌 1부 최종 순위 상위 이만큼이 다음 시즌 참가. */
const CONTINENTAL_QUALIFY_COUNT = 6;
/** 대륙컵 우승 상금(만원) — 국내컵보다 큰 무대라 상금도 더 크다. */
const CONTINENTAL_CUP_PRIZE = 60_000;

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

/**
 * 부 목표: 2부=승격(상위), 1부=잔류(하위권 회피). 난이도로 조정.
 * ambition(장기 계약 누적치)만큼 목표 순위를 더 엄격하게(숫자를 낮게) 만든다.
 */
function divisionObjective(division: number, difficulty: Difficulty, ambition = 0): number {
  const off = DIFFICULTIES[difficulty].targetOffset;
  const base = division === 1 ? PROMOTE_COUNT : CLUBS_PER_DIV - PROMOTE_COUNT; // 2부:3위, 1부:9위
  return Math.max(1, Math.min(CLUBS_PER_DIV, base + off - ambition));
}

export function myDivision(state: GameState): number {
  return myClub(state).division;
}

export function divisionClubs(state: GameState, division: number): Club[] {
  return clubsInDivision(state.clubs, division);
}

/** 라이벌 구단 선정: 같은 부 소속 중 평판이 가장 가까운 구단(제외: 자기 자신). */
function selectRival(clubs: Club[], mine: Club): string {
  const sameDiv = clubs.filter((c) => c.id !== mine.id && c.division === mine.division);
  const pool = sameDiv.length > 0 ? sameDiv : clubs.filter((c) => c.id !== mine.id);
  let best = pool[0]!;
  let bestGap = Math.abs(best.finance.reputation - mine.finance.reputation);
  for (const c of pool) {
    const gap = Math.abs(c.finance.reputation - mine.finance.reputation);
    if (gap < bestGap) { best = c; bestGap = gap; }
  }
  return best.id;
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
    continentalCup: null,
    continentalQualifierIds: [],
    difficulty,
    objective,
    boardConfidence: START_CONFIDENCE,
    demand: generateDemand(
      { overWages: annualWageBill(mine) > wageBudget(mine) }, new Rng(seed + 4242), mine.boardPersona?.style,
    ),
    sponsorGoal: generateSponsorGoal(new Rng(seed + 5252), mine.finance.reputation),
    legends: [],
    rivalClubId: selectRival(clubs, mine),
    rivalRecord: { wins: 0, draws: 0, losses: 0 },
    rivalMeetings: [],
    mediaToneCounts: emptyMediaToneCounts(),
    contractSeasonsLeft: CONTRACT_INITIAL_YEARS,
    ambition: 0,
    ratingHistory: {},
  };
}

export function myClub(state: GameState): Club {
  return state.clubs.find((c) => c.id === state.myClubId)!;
}

/** 내 구단의 현재 에이전트 관계 지수와 등급(Item6, 이적 시장 UI 표시용). */
export function myAgentRelations(state: GameState): { value: number; tier: AgentRelationsTier } {
  const value = agentRelationsOf(myClub(state));
  return { value, tier: agentRelationsTier(value) };
}

/** 라인별 권장 최소 보유 인원(A5) — 이 아래면 부상·정지가 겹칠 때 그 라인이 통째로 빌 위험. */
export const LINE_DEPTH_RECOMMENDED: Record<Line, number> = { GK: 2, DEF: 5, MID: 5, ATT: 3 };

/** 내 구단 라인 중 권장 보유 인원에 못 미치는 라인 목록(뎁스 경고 배너용). */
export function thinSquadLines(state: GameState): { line: Line; count: number }[] {
  const club = myClub(state);
  return (Object.keys(LINE_DEPTH_RECOMMENDED) as Line[])
    .map((line) => ({ line, count: club.players.filter((p) => lineOf(p.position) === line).length }))
    .filter(({ line, count }) => count < LINE_DEPTH_RECOMMENDED[line]);
}

export function rivalClub(state: GameState): Club {
  return state.clubs.find((c) => c.id === state.rivalClubId)!;
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
  // 대륙컵(D17): 지난 시즌 1부 최종 순위 상위 구단만 참가(자격 구단 2개 미만이면 미개최).
  const continentalQualifierIds = state.continentalQualifierIds ?? [];
  const continentalCup = continentalQualifierIds.length >= 2
    ? createCup(
        continentalQualifierIds.map((id) => state.clubs.find((c) => c.id === id)!),
        state.seed + state.season * 1000 + 8,
      )
    : null;
  // 이적 창 마감 직후 스쿼드 기준 언론 예상 순위(시즌 내내 고정).
  const predictedTable = preseasonPrediction(myDivClubs, state.myClubId, repaired);
  // 컵 우승 후보 예측(전 참가 구단 전력 랭킹, 리그 예상 순위와 같은 방식으로 산정).
  const cupFavorites = preseasonPrediction(state.clubs, state.myClubId, repaired);
  return {
    ...state,
    tactics: { ...state.tactics, [state.myClubId]: repaired },
    live: {
      fixtures: ss.fixtures, results: ss.results, cursor: ss.cursor, baseSeed: ss.baseSeed,
      transfers, divisionClubIds: myDivClubs.map((c) => c.id), mediaHandledThroughRound: 0,
      predictedTable, cupFavorites,
    },
    cup,
    continentalCup,
  };
}

/** 대륙컵 다음 라운드 진행(D17, 선수 상태도 변동). 국내컵과 달리 참가 자격이 없으면 null. */
export function playContinentalCupRound(state: GameState): GameState {
  if (!state.continentalCup || isCupOver(state.continentalCup)) return state;
  const continentalCup = enginePlayCupRound(state.continentalCup, state.clubs, tacticMap(state));
  return { ...state, continentalCup };
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

  // 요구 평가용: 오프시즌 이전(사용자가 운영한 스쿼드)의 임금 건전성 캡처
  const wageUnderBudget = annualWageBill(myClub(state)) <= wageBudget(myClub(state));

  // 1) 내 부 완주
  const ss = toSeasonState(state);
  playToEnd(ss, tacticMap(state));
  const myTable = computeTable(ss);
  const { topScorers, awards } = summarizeStats(ss.results, totalRounds(ss));
  // 스쿼드 스냅샷: 오프시즌(나이 증가·은퇴) 전에 나이를 캡처해야 "그 시즌 당시" 기록이 된다 —
  // seasonSquadSnapshot이 club.players에서 나이를 직접 읽지 않고 이 맵을 요구하도록
  // 시그니처에서 강제한다.
  const myPlayerStats = aggregatePlayerStats(ss.results).filter((s) => s.clubId === state.myClubId);
  const agesAtSeasonEnd = new Map(myClub(state).players.map((p) => [p.id, p.age]));
  const mySquad = seasonSquadSnapshot(myTactic(state), myClub(state), myPlayerStats, agesAtSeasonEnd);
  // 출전 기록(apps>0)이 있는 선수만 그 시즌 평균 평점을 이력에 누적(최근 20시즌 유지).
  const ratingHistory: Record<string, SeasonRatingEntry[]> = { ...state.ratingHistory };
  for (const st of myPlayerStats) {
    if (st.apps === 0) continue;
    const hist = [...(ratingHistory[st.playerId] ?? []), { season: state.season, avgRating: st.avgRating }];
    ratingHistory[st.playerId] = hist.length > 20 ? hist.slice(-20) : hist;
  }
  // 더 이상 내 구단 소속이 아닌 선수(방출·판매·은퇴)의 키는 정리 — PlayerDetail은
  // 현재 스쿼드 선수만 열람 가능해 다시 조회될 일이 없는데도 세이브에 영구히
  // 쌓이는 것을 막는다.
  {
    const myPlayerIds = new Set(myClub(state).players.map((p) => p.id));
    for (const id of Object.keys(ratingHistory)) {
      if (!myPlayerIds.has(id)) delete ratingHistory[id];
    }
  }

  // 라이벌전 전적 갱신(같은 부에서 맞붙은 경우만 — 다른 부일 땐 이번 시즌 대결 없음).
  const rivalRecord = { ...state.rivalRecord };
  const newRivalMeetings: RivalMeeting[] = [];
  for (const r of ss.results) {
    const isDerby =
      (r.homeClubId === state.myClubId && r.awayClubId === state.rivalClubId) ||
      (r.awayClubId === state.myClubId && r.homeClubId === state.rivalClubId);
    if (!isDerby) continue;
    const home = r.homeClubId === state.myClubId;
    const myGoals = home ? r.score[0] : r.score[1];
    const oppGoals = home ? r.score[1] : r.score[0];
    let result: RivalMeeting['result'];
    if (myGoals > oppGoals) { rivalRecord.wins++; result = 'win'; }
    else if (myGoals < oppGoals) { rivalRecord.losses++; result = 'loss'; }
    else { rivalRecord.draws++; result = 'draw'; }
    newRivalMeetings.push({ season: state.season, home, myGoals, oppGoals, result, competition: 'league' });
  }

  // 2) 상대 부 자동 시뮬 (통계엔 미포함, 순위/정산/승강용)
  // 시드는 seasonSeed(state)+5000 이었으나, seasonSeed 자체가 이미 seed+season*1000+2
  // 형태라 +5000을 더하면 5시즌 뒤 내 부의 seasonSeed(state')(state'.season=season+5)와
  // 매치 인덱스별로 정확히 동일한 시드가 나오는 문제가 있었다(리그 경기 시뮬 시드가
  // 미래 시즌과 매 시즌 재현되게 충돌). +654321은 1000으로 나눈 나머지가 323이라
  // seasonSeed(어떤 시즌)+커서(0~131 실제 범위)의 나머지(2~133)와 절대 겹치지 않는다.
  const otherDiv = myDiv === 0 ? 1 : 0;
  const otherClubs = divisionClubs(state, otherDiv);
  const otherResult = simulateSeason(otherClubs, seasonSeed(state) + 654_321);
  const otherTable = otherResult.table;

  // 2.5) 임대 주급 분담 정산 — 원 소속 구단이 임대 구단에 분담분을 이체(정산 전 잔고 조정).
  applyLoanWageSubsidies(state.clubs);

  // 3) 정산 (부별 순위 기준) — 최근 폼(승점 비율)이 매치데이 수익에 반영된다.
  const finance = new Map();
  myTable.forEach((row, pos) => {
    const club = state.clubs.find((c) => c.id === row.clubId)!;
    const form = recentForm(ss.results, club.id, 5);
    const formRatio = form.results.length > 0 ? form.points / (form.results.length * 3) : undefined;
    finance.set(club.id, settleSeason(club, pos, CLUBS_PER_DIV, undefined, formRatio));
  });
  otherTable.forEach((row, pos) => {
    const club = state.clubs.find((c) => c.id === row.clubId)!;
    const form = recentForm(otherResult.matches, club.id, 5);
    const formRatio = form.results.length > 0 ? form.points / (form.results.length * 3) : undefined;
    finance.set(club.id, settleSeason(club, pos, CLUBS_PER_DIV, undefined, formRatio));
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
    // 컵에서도 라이벌과 맞붙었다면 전적에 포함(승부차기는 항상 승/패 — 무승부 없음).
    for (const round of finishedCup.rounds) {
      for (const tie of round.ties) {
        if (tie.awayId === null) continue;
        const isDerby =
          (tie.homeId === state.myClubId && tie.awayId === state.rivalClubId) ||
          (tie.awayId === state.myClubId && tie.homeId === state.rivalClubId);
        if (!isDerby) continue;
        const home = tie.homeId === state.myClubId;
        const myGoals = home ? tie.homeScore! : tie.awayScore!;
        const oppGoals = home ? tie.awayScore! : tie.homeScore!;
        const result: RivalMeeting['result'] = tie.winnerId === state.myClubId ? 'win' : 'loss';
        if (result === 'win') rivalRecord.wins++; else rivalRecord.losses++;
        newRivalMeetings.push({
          season: state.season, home, myGoals, oppGoals, result,
          competition: 'cup', penalties: tie.penalties,
        });
      }
    }
  }

  // 4.5) 대륙컵 자동 완료 + 우승 상금(D17 — 국내컵과 별개로, 참가 자격 구단만 대상).
  let continentalCupChampionId: string | undefined;
  let continentalCupChampionName: string | undefined;
  if (state.continentalCup) {
    const finishedContinental = playCupToEnd(state.continentalCup, state.clubs, tacticMap(state));
    if (finishedContinental.championId) {
      continentalCupChampionId = finishedContinental.championId;
      const champClub = state.clubs.find((c) => c.id === finishedContinental.championId);
      continentalCupChampionName = champClub?.name;
      if (champClub) {
        champClub.finance.balance += CONTINENTAL_CUP_PRIZE;
        champClub.finance.transferBudget += CONTINENTAL_CUP_PRIZE;
      }
    }
  }

  // 5) 오프시즌 (전 구단)
  const {
    retirements, intakeByClub, intakePlayersByClub, fireSalesByClub, retiredPlayers, milestones, debutEvents,
    loanReturns, loanObligations, reservePromotions, staffDepartures, addOnPayouts,
  } = runOffseason(state.clubs, new Rng(offseasonSeed(state)));
  // 내 구단 선수의 이번 시즌 리저브 승격(시즌 요약에 첨부)
  const myReservePromotions = reservePromotions.filter((r) => r.clubId === state.myClubId);
  // 내 구단이 관련된 임대 복귀(보낸 임대가 돌아오거나, 데려온 임대가 복귀)
  const myLoanReturns: LoanReturnEvent[] = loanReturns.filter(
    (r) => r.fromClubId === state.myClubId || r.toClubId === state.myClubId,
  );
  // 내 구단이 관련된 의무완전이적 조항 발동(A1 — 판매자로서 이적료를 받거나, 구매자로서 완전 영입 확정)
  const myLoanObligations: LoanObligationEvent[] = loanObligations.filter(
    (o) => o.fromClubId === state.myClubId || o.toClubId === state.myClubId,
  );
  // 내 구단에서 계약 만료로 이탈해 후임이 영입된 실명 스태프(시즌 요약에 첨부)
  const myStaffDepartures: StaffDepartureEvent[] = staffDepartures.filter((d) => d.clubId === state.myClubId);
  // 내 구단이 관련된 성과 기반 후불 이적료(Add-on) 발동(신규 개선 항목 3)
  const myAddOnPayouts: AddOnEvent[] = addOnPayouts.filter(
    (a) => a.fromClubId === state.myClubId || a.toClubId === state.myClubId,
  );
  // 내 구단에서 은퇴한 선수는 레전드 아카이브에 영구 보존
  const newLegends: ClubLegend[] = retiredPlayers
    .filter((r) => r.clubId === state.myClubId)
    .map((r) => ({ ...r, season: state.season }));
  // 내 구단 선수의 이번 시즌 통산 마일스톤(시즌 요약에 첨부)
  const myMilestones = milestones.filter((m) => m.clubId === state.myClubId);
  // 내 구단 유스 배출 소개(잠재력 높은 순, 시즌 요약에 첨부)
  const myYouthProspects: YouthProspect[] = (intakePlayersByClub.get(state.myClubId) ?? [])
    .map((p) => ({ playerId: p.id, name: p.name, position: p.position, age: p.age, potential: p.potential }))
    .sort((a, b) => b.potential - a.potential);
  // 과거에 유스 기대주로 소개됐던 선수가 이번 시즌 데뷔/첫 골을 기록하면 후속 소식으로 연결
  const introducedProspectIds = new Set(
    state.history.flatMap((s) => (s.youthProspects ?? []).map((p) => p.playerId)),
  );
  const myProspectUpdates: YouthProspectUpdate[] = debutEvents
    .filter((e) => e.clubId === state.myClubId && introducedProspectIds.has(e.playerId))
    .map((e) => ({ playerId: e.playerId, name: e.name, kind: e.kind }));

  // 5.5) 국가대표 차출 (오프시즌 리셋 이후 — 피로/부상이 새 시즌에 반영)
  // TOURNAMENT_INTERVAL_SEASONS마다는 정기 차출 대신 비정기 국제대회(월드컵/유로급, C15)로 확장.
  const isTournamentSeason = state.season % TOURNAMENT_INTERVAL_SEASONS === 0;
  let intl: { byClub: Map<string, number> };
  let internationalTournamentChampion: string | null | undefined;
  if (isTournamentSeason) {
    const tournament = runInternationalTournament(state.clubs, new Rng(offseasonSeed(state) + 777));
    intl = tournament;
    internationalTournamentChampion = tournament.championNation;
  } else {
    intl = runInternationalBreak(state.clubs, new Rng(offseasonSeed(state) + 777));
  }
  const myCallUps = intl.byClub.get(state.myClubId) ?? 0;
  const myIntlInjuries = myClub(state).players.filter((p) => p.injuryMatches > 0).length;

  // 6) 승강 (1부↔2부) — 2부 상위 AUTO_PROMOTE_COUNT팀은 자동 승격, 그 아래 4팀(3~6위)은
  // 미니 토너먼트(준결승+결승)로 마지막 승격 자리를 겨룬다. 강등 인원(PROMOTE_COUNT)은
  // 그대로 유지해 승강 총원의 균형을 지킨다.
  const d1Table = myDiv === 0 ? myTable : otherTable;
  const d2Table = myDiv === 1 ? myTable : otherTable;
  // 다음 시즌 대륙컵 참가 구단(D17) — 이번 시즌 1부 최종 순위 상위 CONTINENTAL_QUALIFY_COUNT개.
  const continentalQualifierIds = d1Table.slice(0, CONTINENTAL_QUALIFY_COUNT).map((r) => r.clubId);
  const AUTO_PROMOTE_COUNT = 2;
  const promRel = applyPromotionRelegation(state.clubs, d1Table, d2Table, AUTO_PROMOTE_COUNT, PROMOTE_COUNT);

  let promotionPlayoffResult: SeasonSummary['promotionPlayoff'];
  const playoffCandidateIds = d2Table.slice(AUTO_PROMOTE_COUNT, AUTO_PROMOTE_COUNT + 4).map((r) => r.clubId);
  if (playoffCandidateIds.length === 4) {
    const playoffCup: CupState = {
      participantIds: playoffCandidateIds, rounds: [], baseSeed: seasonSeed(state) + 828_282, championId: null,
    };
    const finishedPlayoff = playCupToEnd(playoffCup, state.clubs, tacticMap(state));
    if (finishedPlayoff.championId) {
      const champ = state.clubs.find((c) => c.id === finishedPlayoff.championId)!;
      champ.division = 0;
      promRel.promoted.push(finishedPlayoff.championId);
      promotionPlayoffResult = {
        participants: playoffCandidateIds.map((id) => ({ clubId: id, clubName: state.clubs.find((c) => c.id === id)!.name })),
        championId: finishedPlayoff.championId,
        championName: champ.name,
      };
    }
  }
  const promoted = promRel.promoted.includes(state.myClubId);
  const relegated = promRel.relegated.includes(state.myClubId);

  // 6.5) 이사회 신뢰도 갱신 (이번 시즌 목표 대비 성적 + 승강 + 재정 + 특별 요구)
  // 이사회 성향(인내심·재정 스타일)이 설정돼 있으면 목표 미달의 가혹함과 재정 민감도가 반영된다.
  const boardPersona = myClub(state).boardPersona;
  const myPosition = myTable.findIndex((r) => r.clubId === state.myClubId) + 1;
  const preseasonRank = state.live.predictedTable.find((p) => p.clubId === state.myClubId)?.predictedPos;
  const surprise = preseasonRank !== undefined ? classifySurprise(preseasonRank, myPosition) : undefined;
  const myNet = finance.get(state.myClubId)?.net ?? 0;
  const delta = confidenceDelta({
    position: myPosition, objective: state.objective, promoted, relegated, netFinance: myNet,
  }, boardPersona);

  // 이사회 특별 요구 평가
  const myName = myClub(state).name;
  let demandResult: { label: string; met: boolean } | undefined;
  let demandDelta = 0;
  if (state.demand) {
    const met = evaluateDemand(state.demand, {
      wageUnderBudget,
      cupWon: cupChampionId === state.myClubId,
      clubTopScorer: awards.topScorer?.clubName === myName,
      topHalfFinish: myPosition <= Math.ceil(myTable.length / 2),
    });
    demandDelta = demandConfidence(state.demand, met);
    demandResult = { label: DEMAND_LABEL[state.demand.kind], met };
  }

  // 스폰서 보너스 목표 평가 — 신뢰도가 아닌 일시불 현금 보너스로 이어진다. 연속으로
  // 달성할수록 스트릭 배율(C-new2)이 다음 보너스에 가산되고, 실패하면 리셋된다.
  let sponsorGoalResult: { label: string; met: boolean; bonus: number } | undefined;
  let nextSponsorStreak = state.sponsorStreak ?? 0;
  if (state.sponsorGoal) {
    const met = evaluateSponsorGoal(state.sponsorGoal, {
      top4Finish: myPosition <= 4,
      cupWon: cupChampionId === state.myClubId,
    });
    const streakBefore = state.sponsorStreak ?? 0;
    const paidBonus = met ? Math.round(state.sponsorGoal.bonus * sponsorStreakMultiplier(streakBefore)) : 0;
    if (met) {
      const me = myClub(state);
      me.finance.balance += paidBonus;
      me.finance.transferBudget += paidBonus;
      nextSponsorStreak = streakBefore + 1;
    } else {
      nextSponsorStreak = 0;
    }
    sponsorGoalResult = { label: SPONSOR_GOAL_LABEL[state.sponsorGoal.kind], met, bonus: paidBonus };
  }

  const boardConfidence = applyConfidence(state.boardConfidence, delta + demandDelta);
  const sacked = isSacked(boardConfidence);

  // 이사회 신뢰 등급이 이번 시즌 실제로 올랐으면(예: 불안정→안정) 일회성 투자 예산 승인(C-new1).
  const prevBoardStatus = boardStatus(state.boardConfidence);
  const newBoardStatus = boardStatus(boardConfidence);
  const boardTierBonus = boardTierUpgradeBonus(prevBoardStatus, newBoardStatus, myClub(state).finance.reputation);
  let boardBonusResult: { fromStatus: BoardStatus; toStatus: BoardStatus; amount: number } | undefined;
  if (boardTierBonus > 0) {
    const me = myClub(state);
    me.finance.balance += boardTierBonus;
    me.finance.transferBudget += boardTierBonus;
    boardBonusResult = { fromStatus: prevBoardStatus, toStatus: newBoardStatus, amount: boardTierBonus };
  }

  // 다음 시즌 요구/스폰서 목표 생성(오프시즌 이후 임금 기준 + 장기 계약 누적치만큼 이사회 기대치 상향)
  const nextDemand = generateDemand(
    { overWages: annualWageBill(myClub(state)) > wageBudget(myClub(state)), ambition: state.ambition },
    new Rng(offseasonSeed(state) + 909),
    boardPersona?.style,
  );
  const nextSponsorGoal = generateSponsorGoal(new Rng(offseasonSeed(state) + 1717), myClub(state).finance.reputation);

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
    internationalTournamentChampion,
    demand: demandResult,
    squad: mySquad,
    milestones: myMilestones,
    preseasonRank,
    surprise,
    youthProspects: myYouthProspects,
    prospectUpdates: myProspectUpdates,
    sponsorGoal: sponsorGoalResult,
    promotionPlayoff: promotionPlayoffResult,
    loanReturns: myLoanReturns,
    loanObligations: myLoanObligations,
    reservePromotions: myReservePromotions,
    staffDepartures: myStaffDepartures,
    continentalCupChampionId,
    continentalCupChampionName,
    qualifiedForContinental: continentalQualifierIds.includes(state.myClubId),
    boardTierBonus: boardBonusResult,
    addOnPayouts: myAddOnPayouts,
  };

  const repaired = repairTactic(myClub(state), myTactic(state));
  return {
    ...state,
    season: state.season + 1,
    history: [...state.history, summary],
    tactics: { ...state.tactics, [state.myClubId]: repaired },
    // 새 부 기준으로 목표 재설정(장기 계약 누적치만큼 더 엄격하게)
    objective: divisionObjective(myClub(state).division, state.difficulty, state.ambition),
    boardConfidence,
    sacked,
    demand: nextDemand,
    sponsorGoal: nextSponsorGoal,
    sponsorStreak: nextSponsorStreak,
    legends: [...state.legends, ...newLegends],
    rivalRecord,
    rivalMeetings: [...state.rivalMeetings, ...newRivalMeetings],
    contractSeasonsLeft: state.contractSeasonsLeft - 1,
    ratingHistory,
    live: null,
    cup: null,
    continentalCup: null,
    continentalQualifierIds,
  };
}

export function setMyTactic(state: GameState, tactic: Tactic): GameState {
  return { ...state, tactics: { ...state.tactics, [state.myClubId]: tactic } };
}

/** 재계약 시 선택 가능한 계약 기간(년) 하한·상한(신규 개선 항목 5). */
export const RENEWAL_MIN_YEARS = 2;
export const RENEWAL_MAX_YEARS = 5;

/**
 * 내 선수 재계약 (계약 연장 + 임금 인상 + 사기 상승, 계약금 지출).
 * 신규 개선 항목 5(다년 계약 사인온보너스) — years로 계약 기간을 직접 고를 수 있고
 * (짧을수록/길수록 계약금이 비례해 늘거나 준다), signOnBonus를 얹으면 그만큼 계약금
 * 위에 추가로 지불하는 대신 사기가 더 크게 오른다(체감 — 무한정 사기를 올리진 않는다).
 */
export function renewContract(
  state: GameState, playerId: string, years = 4, signOnBonus = 0,
): ActionOutcome {
  const club = myClub(state);
  const p = club.players.find((pl) => pl.id === playerId);
  if (!p) return { state, ok: false, message: '선수를 찾을 수 없습니다.' };
  if (p.contractYears > 2) return { state, ok: false, message: '아직 재계약이 필요하지 않습니다.' };
  const clampedYears = Math.min(RENEWAL_MAX_YEARS, Math.max(RENEWAL_MIN_YEARS, Math.round(years)));
  const bonus = Math.max(0, Math.round(signOnBonus));
  // 로열티(신규 개선 항목 10) — 이적 없이 오래 남아준 선수는 재계약이 저렴해진다.
  const discount = loyaltyDiscount(p.seasonsAtClub ?? 0);
  const baseCost = Math.round(p.wage * 20 * (clampedYears / 4) * (1 - discount));
  const cost = baseCost + bonus;
  if (club.finance.balance < cost) return { state, ok: false, message: '자금이 부족합니다.' };
  club.finance.balance -= cost;
  p.contractYears = clampedYears;
  p.wage = Math.round(p.wage * 1.1);
  const bonusMoraleBoost = bonus > 0 ? Math.min(0.15, bonus / (p.wage * 100)) : 0;
  p.morale = Math.min(1, p.morale + 0.15 + bonusMoraleBoost);
  const bonusMsg = bonus > 0 ? ` + 사인온보너스 ${formatMoney(bonus)}` : '';
  const loyaltyMsg = discount > 0 ? ` (로열티 할인 ${Math.round(discount * 100)}%)` : '';
  return {
    state: { ...state }, ok: true,
    message: `${p.name} 재계약 완료 (${clampedYears}년 · 계약금 ${formatMoney(baseCost)}${bonusMsg}${loyaltyMsg})`,
  };
}

/** 내 선수의 훈련 포커스 설정. */
export function setTrainingFocus(
  state: GameState, playerId: string, focus: import('@soccer-tycoon/engine').TrainingFocus,
): GameState {
  const p = myClub(state).players.find((pl) => pl.id === playerId);
  if (p) p.trainingFocus = focus;
  return { ...state };
}

/** 포지션 전환 훈련 대상 지정(해제하려면 undefined). 시즌 경계마다 코칭 지원을 받아 숙련도가 오른다. */
export function setTrainingPosition(
  state: GameState, playerId: string, position: import('@soccer-tycoon/engine').Position | undefined,
): GameState {
  const p = myClub(state).players.find((pl) => pl.id === playerId);
  if (p) p.trainingPosition = position;
  return { ...state };
}

/** 멘토-멘티 페어링 직접 지정(B14) — 자동(같은 라인) 멘토링보다 강한 성장 보너스를 준다. */
export function assignMentorAction(state: GameState, mentorId: string, menteeId: string): ActionOutcome {
  const club = myClub(state);
  const r = engineAssignMentor(club, mentorId, menteeId);
  if (!r.ok) return { state, ok: false, message: r.reason! };
  return { state: { ...state }, ok: true, message: '멘토 페어링을 지정했습니다.' };
}

/** 지정된 멘토 페어링 해제(B14). */
export function clearMentorPairingAction(state: GameState, menteeId: string): ActionOutcome {
  const club = myClub(state);
  engineClearMentorPairing(club, menteeId);
  return { state: { ...state }, ok: true, message: '멘토 페어링을 해제했습니다.' };
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

/** 이적 협상: 제안액에 대한 매도 구단 반응(수락/역제안/거절). round는 이 협상에서 이미
 *  진행된 역제안 횟수(0-base) — 라운드가 늘수록 매도 구단 호가에 조급증이 붙고,
 *  상한을 넘기면 더 이상 밀당하지 않고 협상을 접는다. 상태 변경 없음.
 *  이전에 이 선수와 밀당이 완전히 결렬됐다면(Item1), 쿨다운이 풀리기 전까지는
 *  재협상 자체를 곧장 거절한다. */
export function negotiate(state: GameState, playerId: string, offer: number, round = 0): OfferEvaluation {
  if (state.live) return { ok: false, reason: '이적은 프리시즌에만 가능합니다.' };
  const cooldownUntil = state.negotiationCooldowns?.[playerId];
  if (cooldownUntil !== undefined && state.season < cooldownUntil) {
    return {
      ok: true, outcome: 'rejected', roundsExhausted: true,
      reason: `지난 협상 결렬 여파로 이번 시즌은 재협상을 거절당했습니다(${cooldownUntil}시즌부터 재시도 가능).`,
    };
  }
  return evaluateOffer(state.clubs, state.myClubId, playerId, offer, round);
}

/** 밀당이 완전히 결렬됐을 때(evaluateOffer의 roundsExhausted) 호출 — 다음 시즌까지
 *  이 선수와의 재협상을 막고(Item1), 에이전트 관계 지수를 깎는다(Item6). */
export function recordNegotiationBreakdown(state: GameState, playerId: string): GameState {
  const club = myClub(state);
  club.agentRelations = Math.max(
    AGENT_RELATIONS_MIN,
    (club.agentRelations ?? AGENT_RELATIONS_DEFAULT) - AGENT_RELATIONS_BREAKDOWN_PENALTY,
  );
  return {
    ...state,
    negotiationCooldowns: { ...state.negotiationCooldowns, [playerId]: state.season + 1 },
  };
}

/** 경쟁 입찰(신규 개선 항목 9)로 협상 중이던 선수를 라이벌 구단에 빼앗겼을 때 실제로
 *  그 이적을 확정한다. negotiate()가 outcome:'lostToRival'을 반환하면, 화면에 결과를
 *  보여준 뒤 이 액션을 호출해 evaluateOffer가 계산한 rivalClubId·rivalBid로 이적을 집행한다. */
export function resolveRivalSnipe(
  state: GameState, playerId: string, rivalClubId: string, bid: number,
): ActionOutcome {
  if (state.live) return { state, ok: false, message: '이적은 프리시즌에만 가능합니다.' };
  const r = executeRivalSnipe(state.clubs, rivalClubId, playerId, bid);
  if (!r.ok) return { state, ok: false, message: r.reason! };
  return {
    state: { ...state }, ok: true,
    message: `${r.playerName} 선수를 ${r.rivalClubName} 구단이 ${formatMoney(r.fee!)}에 채갔습니다.`,
  };
}

/** 합의된 이적료로 영입 실행(협상 타결). 이적료 외에 계약 연수에 비례한 에이전트
 *  수수료가 별도로 잔고에서 차감된다. */
export function buyAt(state: GameState, playerId: string, fee: number): ActionOutcome {
  if (state.live) return { state, ok: false, message: '이적은 프리시즌에만 가능합니다.' };
  const r = buyPlayerAt(state.clubs, state.myClubId, playerId, fee);
  if (!r.ok) return { state, ok: false, message: r.reason! };
  const feeMsg = `이적료 ${formatMoney(r.fee!)} + 에이전트 수수료 ${formatMoney(r.agentFee!)}`;
  return { state: afterSquadChange(state), ok: true, message: `${r.playerName} 영입 완료 (${feeMsg})` };
}

/** 방출(바이아웃) 조항 이용 즉시 영입 — 협상 없이 조항 금액 그대로 지불한다. */
export function buyViaReleaseClause(state: GameState, playerId: string): ActionOutcome {
  if (state.live) return { state, ok: false, message: '이적은 프리시즌에만 가능합니다.' };
  const r = buyPlayerViaReleaseClause(state.clubs, state.myClubId, playerId);
  if (!r.ok) return { state, ok: false, message: r.reason! };
  const feeMsg = `방출조항 ${formatMoney(r.fee!)} + 에이전트 수수료 ${formatMoney(r.agentFee!)}`;
  return { state: afterSquadChange(state), ok: true, message: `${r.playerName} 영입 완료 (${feeMsg})` };
}

/** 이적 마감시한 패닉 바이(D-day 프리미엄, Item7) — 협상 없이 호가에 웃돈을 얹어
 *  즉시 확정 영입한다. 협상이 결렬되기 직전이거나 더 밀당할 여유가 없을 때 쓴다. */
export function panicBuyAction(state: GameState, playerId: string): ActionOutcome {
  if (state.live) return { state, ok: false, message: '이적은 프리시즌에만 가능합니다.' };
  const r = enginePanicBuy(state.clubs, state.myClubId, playerId);
  if (!r.ok) return { state, ok: false, message: r.reason! };
  const feeMsg = `패닉 바이 ${formatMoney(r.fee!)}(호가+${Math.round((PANIC_BUY_PREMIUM - 1) * 100)}%) + 에이전트 수수료 ${formatMoney(r.agentFee!)}`;
  return { state: afterSquadChange(state), ok: true, message: `${r.playerName} 영입 완료 (${feeMsg})` };
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

/** 특정 구단 입찰 수락 → 판매 실행. buybackFee를 지정하면(신규 개선 항목 2) 판매가
 *  이상의 금액으로 향후 되사올 수 있는 바이백 조항이 함께 붙는다. */
export function acceptSell(
  state: GameState, playerId: string, buyerId: string, buybackFee?: number,
): ActionOutcome {
  if (state.live) return { state, ok: false, message: '이적은 프리시즌에만 가능합니다.' };
  const r = acceptSellOffer(state.clubs, state.myClubId, playerId, buyerId, buybackFee);
  if (!r.ok) return { state, ok: false, message: r.reason! };
  const buybackMsg = buybackFee !== undefined ? ` · 바이백 ${formatMoney(buybackFee)}` : '';
  return {
    state: afterSquadChange(state), ok: true,
    message: `${r.playerName} → ${r.buyerName} 판매 완료 (${formatMoney(r.fee!)}${buybackMsg})`,
  };
}

/** 바이백 조항 행사 — 원 소속 구단이 조항 금액으로 즉시 재영입한다(신규 개선 항목 2). */
export function buyback(state: GameState, playerId: string): ActionOutcome {
  if (state.live) return { state, ok: false, message: '이적은 프리시즌에만 가능합니다.' };
  const r = exerciseBuyback(state.clubs, state.myClubId, playerId);
  if (!r.ok) return { state, ok: false, message: r.reason! };
  return {
    state: afterSquadChange(state), ok: true,
    message: `${r.playerName} 바이백 완료 (${r.sellerName} → 우리 구단, ${formatMoney(r.fee!)})`,
  };
}

/** 방금 판매한 선수에게 성과 기반 후불 이적료(Add-on) 조항을 붙인다(신규 개선 항목 3) —
 *  판매(acceptSell) 직후 별도로 호출해 조건을 지정한다. */
export function attachAddOn(
  state: GameState, playerId: string, appearances: number | undefined, goals: number | undefined, fee: number,
): ActionOutcome {
  const r = attachAddOnClause(state.clubs, playerId, state.myClubId, appearances, goals, fee);
  if (!r.ok) return { state, ok: false, message: r.reason! };
  return { state: { ...state }, ok: true, message: '성과 기반 후불 이적료 조항을 추가했습니다.' };
}

export function release(state: GameState, playerId: string): ActionOutcome {
  if (state.live) return { state, ok: false, message: '이적은 프리시즌에만 가능합니다.' };
  const r = releasePlayer(state.clubs, state.myClubId, playerId);
  if (!r.ok) return { state, ok: false, message: r.reason! };
  return { state: afterSquadChange(state), ok: true, message: `${r.playerName} 방출 완료` };
}

/** 내 선수를 다른 구단으로 임대 보낸다(원 소속은 유지, 실제 출전은 상대 구단에서). */
export function loanOut(state: GameState, playerId: string, toClubId: string, terms: LoanTerms): ActionOutcome {
  if (state.live) return { state, ok: false, message: '이적은 프리시즌에만 가능합니다.' };
  const r = loanPlayerOut(state.clubs, state.myClubId, toClubId, playerId, terms);
  if (!r.ok) return { state, ok: false, message: r.reason! };
  return { state: afterSquadChange(state), ok: true, message: `${r.playerName} 임대 완료 (${terms.seasons}시즌)` };
}

/** 다른 구단 선수를 내 구단으로 임대 데려온다. */
export function loanIn(state: GameState, playerId: string, fromClubId: string, terms: LoanTerms): ActionOutcome {
  if (state.live) return { state, ok: false, message: '이적은 프리시즌에만 가능합니다.' };
  const r = loanPlayerOut(state.clubs, fromClubId, state.myClubId, playerId, terms);
  if (!r.ok) return { state, ok: false, message: r.reason! };
  return { state: afterSquadChange(state), ok: true, message: `${r.playerName} 임대 영입 완료 (${terms.seasons}시즌)` };
}

/** 내가 임대 보낸 선수를 즉시 회수한다(콜백 조항). */
export function recallLoan(state: GameState, playerId: string): ActionOutcome {
  if (state.live) return { state, ok: false, message: '이적은 프리시즌에만 가능합니다.' };
  const r = recallLoanPlayer(state.clubs, playerId);
  if (!r.ok) return { state, ok: false, message: r.reason! };
  return { state: afterSquadChange(state), ok: true, message: `${r.playerName} 임대 회수 완료` };
}

/** 임대로 데려온 선수의 우선매수옵션(OTB, 신규 개선 항목 4)을 행사해 즉시 완전 영입한다. */
export function exerciseBuyOption(state: GameState, playerId: string): ActionOutcome {
  if (state.live) return { state, ok: false, message: '이적은 프리시즌에만 가능합니다.' };
  const r = exerciseLoanBuyOption(state.clubs, state.myClubId, playerId);
  if (!r.ok) return { state, ok: false, message: r.reason! };
  return { state: afterSquadChange(state), ok: true, message: `${r.playerName} 우선매수옵션 행사 완료 (${formatMoney(r.fee!)})` };
}

/**
 * 내 선수와 다른 구단 선수를 맞교환한다(A2). cashAdjustment 양수=내가 추가 지불,
 * 음수=상대가 추가 지불.
 */
export function swapDeal(
  state: GameState, myPlayerId: string, otherClubId: string, otherPlayerId: string, cashAdjustment = 0,
): ActionOutcome {
  if (state.live) return { state, ok: false, message: '이적은 프리시즌에만 가능합니다.' };
  const r = swapPlayers(state.clubs, state.myClubId, otherClubId, myPlayerId, otherPlayerId, cashAdjustment);
  if (!r.ok) return { state, ok: false, message: r.reason! };
  return { state: afterSquadChange(state), ok: true, message: `${r.playerAName} ↔ ${r.playerBName} 맞교환 완료` };
}

/** 내가 임대 보낸 선수 목록 — 실제로는 다른 구단 스쿼드에서 뛰고 있다. */
export function myLoanedOutPlayers(state: GameState): { player: Player; loanClubId: string; loanClubName: string }[] {
  const out: { player: Player; loanClubId: string; loanClubName: string }[] = [];
  for (const club of state.clubs) {
    if (club.id === state.myClubId) continue;
    for (const p of club.players) {
      if (p.loanFromClubId === state.myClubId) out.push({ player: p, loanClubId: club.id, loanClubName: club.name });
    }
  }
  return out;
}

const STAFF_LABEL: Record<string, string> = {
  coaching: '총괄 코치', medical: '의료', scouting: '스카우팅', youth: '유스',
  coachGk: 'GK 코치', coachAttack: '공격 코치', coachDefense: '수비 코치', coachPhysical: '피지컬 코치',
  reserveCoach: '리저브 전담 코치',
};

/** 스태프 업그레이드 (보유 자금 사용). 실명 직책(코칭/의료/스카우팅/유스)은 업그레이드와
 *  함께 새 인물이 영입되므로, 결과 메시지에 신규 영입 소식을 함께 담는다. */
export function upgradeStaffAction(state: GameState, kind: StaffKind): ActionOutcome {
  const club = myClub(state);
  const r = engineUpgradeStaff(club, kind);
  if (!r.ok) return { state, ok: false, message: r.reason! };
  const membersRec = club.staff.members as Record<string, { name: string; age: number }> | undefined;
  const member = membersRec?.[kind];
  const hireMsg = member ? ` — 신규 영입: ${member.name}(${member.age}세)` : '';
  return {
    state: { ...state },
    ok: true,
    message: `${STAFF_LABEL[kind]} Lv.${r.newLevel} (−${formatMoney(r.cost!)})${hireMsg}`,
  };
}

/** 스타디움 한 단계 증축(보유 자금 사용) — 매치데이 수익 상한이 여러 시즌에 걸쳐 오른다. */
export function upgradeStadiumAction(state: GameState): ActionOutcome {
  const club = myClub(state);
  const r = engineUpgradeStadium(club);
  if (!r.ok) return { state, ok: false, message: r.reason! };
  return {
    state: { ...state }, ok: true,
    message: `스타디움 Lv.${r.newLevel} 증축 완료 (−${formatMoney(r.cost!)})`,
  };
}

/** 아카데미 시설 한 단계 증축(보유 자금 사용, B11) — 유스 스태프와 별개로 유스 인테이크
 *  잠재력에 추가 보너스가 여러 시즌에 걸쳐 쌓인다. */
export function upgradeAcademyAction(state: GameState): ActionOutcome {
  const club = myClub(state);
  const r = engineUpgradeAcademy(club);
  if (!r.ok) return { state, ok: false, message: r.reason! };
  return {
    state: { ...state }, ok: true,
    message: `아카데미 시설 Lv.${r.newLevel} 증축 완료 (−${formatMoney(r.cost!)})`,
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

/** 시즌 중간 페이스 체크포인트(대략 1/3, 2/3 지점)에서만 등장. */
const PACE_CHECKPOINT_FRACTIONS = [1 / 3, 2 / 3];

export interface PaceCheckpoint {
  round: number;
  totalRounds: number;
  position: number;
  objective: number;
  /** 목표 대비 페이스. ahead=여유, onTrack=근접, behind=미달 위험. */
  status: 'ahead' | 'onTrack' | 'behind';
  /** 라이벌이 이번 시즌 같은 부에 있을 때만(승강으로 갈리면 없음). */
  rival?: { name: string; position: number };
}

/**
 * 정확히 체크포인트 라운드에 도달했을 때만 순위 페이스 정보를 반환(그 외엔 null).
 * "남은 경기 시뮬"처럼 여러 라운드를 건너뛰면 자연스럽게 지나칠 수 있다(라운드 단위 관전 흐름 전용).
 */
export function paceCheckpoint(state: GameState): PaceCheckpoint | null {
  if (!state.live) return null;
  const live = state.live;
  if (live.cursor === 0) return null; // 아직 완료된 라운드가 없음
  // liveProgress().round는 "다음에 진행할" 라운드라 체크포인트에 이 값을 그대로 쓰면
  // checkMediaEvent와 달리 "마지막으로 끝난 라운드"가 아닌 한 라운드 이른 시점에
  // 체크포인트가 뜨면서, 정작 순위표에는 그 이전 라운드까지의 데이터만 반영돼 있었다.
  const lastCompletedRound = live.fixtures[live.cursor - 1]!.round;
  const prog = liveProgress(state);
  if (prog.over) return null;
  const checkpointRounds = PACE_CHECKPOINT_FRACTIONS.map((f) => Math.round(prog.total * f));
  if (!checkpointRounds.includes(lastCompletedRound)) return null;
  const table = liveTable(state);
  const position = table.findIndex((r) => r.clubId === state.myClubId) + 1;
  if (position <= 0) return null;
  const gap = state.objective - position; // 양수=목표보다 여유, 음수=목표 미달
  const status: PaceCheckpoint['status'] = gap >= 2 ? 'ahead' : gap >= -1 ? 'onTrack' : 'behind';
  const rivalIdx = table.findIndex((r) => r.clubId === state.rivalClubId);
  const rival = rivalIdx >= 0 ? { name: table[rivalIdx]!.name, position: rivalIdx + 1 } : undefined;
  return { round: lastCompletedRound, totalRounds: prog.total, position, objective: state.objective, status, rival };
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

/** 대기 중인 미디어 인터뷰(경기 후 기자 질의응답). */
export interface MediaEvent {
  kind: MediaEventKind;
  round: number;
  myClubName: string;
  oppName: string;
  score: [number, number];
  home: boolean;
  options: MediaToneOption[];
}

/**
 * 마지막으로 끝난 라운드에 내 경기가 있었고 아직 처리하지 않았다면,
 * 라운드 시드 고정 난수로 인터뷰 개최 여부를 판정한다(재현 가능).
 */
export function checkMediaEvent(state: GameState): MediaEvent | null {
  if (!state.live) return null;
  const live = state.live;
  if (live.cursor === 0) return null;
  const lastRound = live.fixtures[live.cursor - 1]!.round;
  if (lastRound <= live.mediaHandledThroughRound) return null;
  const myResult = live.results.find(
    (r, i) => live.fixtures[i]?.round === lastRound &&
      (r.homeClubId === state.myClubId || r.awayClubId === state.myClubId),
  );
  if (!myResult) return null;
  const rng = new Rng(state.seed + state.season * 1000 + lastRound * 7 + 5555);
  if (!shouldTriggerMediaEvent(rng)) return null;
  const home = myResult.homeClubId === state.myClubId;
  const myGoals = home ? myResult.score[0] : myResult.score[1];
  const oppGoals = home ? myResult.score[1] : myResult.score[0];
  const kind = matchOutcomeKind(myGoals, oppGoals);
  return {
    kind,
    round: lastRound,
    myClubName: home ? myResult.homeClubName : myResult.awayClubName,
    oppName: home ? myResult.awayClubName : myResult.homeClubName,
    score: myResult.score,
    home,
    options: mediaToneOptions(kind),
  };
}

/** 인터뷰 답변 적용: 스쿼드 사기(전원) + 이사회 신뢰도, 해당 라운드를 처리 완료로 표시. */
export function respondMedia(state: GameState, event: MediaEvent, tone: MediaTone): GameState {
  // 이미 처리된 라운드의 이벤트를 재적용하면(이중 클릭 등) 사기·신뢰도가 두 번
  // 반영되고 managerPersona 집계도 중복 카운트된다 — checkMediaEvent가 다시 반환하지
  // 않는 이벤트라도 호출자가 들고 있던 값으로 재호출할 수 있으므로 여기서도 막는다.
  if (!state.live || event.round <= state.live.mediaHandledThroughRound) return state;
  const option = event.options.find((o) => o.tone === tone);
  if (option) {
    applyMediaTone(myClub(state), option);
  }
  const boardConfidence = applyConfidence(state.boardConfidence, option?.confidenceDelta ?? 0);
  return {
    ...state,
    boardConfidence,
    sacked: isSacked(boardConfidence),
    live: state.live && { ...state.live, mediaHandledThroughRound: event.round },
    mediaToneCounts: option
      ? { ...state.mediaToneCounts, [tone]: (state.mediaToneCounts[tone] ?? 0) + 1 }
      : state.mediaToneCounts,
  };
}

/** 누적 인터뷰 답변 성향으로 형성된 감독 이미지("아직 형성 안 됨" = neutral). */
export function managerPersona(state: GameState): ManagerPersona {
  let bold = 0;
  let humble = 0;
  for (const [tone, count] of Object.entries(state.mediaToneCounts) as [MediaTone, number][]) {
    if (MEDIA_TONE_STYLE[tone] === 'bold') bold += count;
    else humble += count;
  }
  return classifyPersona(bold, humble);
}

/** 인터뷰를 답변 없이 넘김(효과 없음, 재노출만 방지). */
export function dismissMedia(state: GameState, event: MediaEvent): GameState {
  return { ...state, live: state.live && { ...state.live, mediaHandledThroughRound: event.round } };
}

// ── 감독 계약 갱신 ──────────────────────────────

export interface ContractOption {
  years: number;
  /** 체결 시 이사회 신뢰도 변화. */
  confidenceDelta: number;
  /** 체결 시 ambition 누적치 변화(목표 순위를 이만큼 더 엄격하게). */
  ambitionDelta: number;
}

const CONTRACT_OPTIONS: ContractOption[] = [
  { years: 1, confidenceDelta: 3, ambitionDelta: 0 },
  { years: 3, confidenceDelta: 10, ambitionDelta: 1 },
];

/** 계약이 만료(잔여 0 이하)됐고 아직 경질되지 않았다면 갱신 선택지를 제공. */
export function contractOptions(state: GameState): ContractOption[] | null {
  if (state.sacked) return null;
  if (state.contractSeasonsLeft > 0) return null;
  return CONTRACT_OPTIONS;
}

/** 계약 갱신 체결: 잔여 시즌 재설정 + 신뢰도 보너스 + (장기 계약이면) 장기적 목표 상향. */
export function signContract(state: GameState, years: number): GameState {
  // contractOptions와 동일한 전제조건 — 계약이 아직 유효한데(잔여>0) 호출되면
  // 잔여 기간을 리셋하고 신뢰도·ambition 보너스를 조용히 또 부여하게 된다.
  if (state.sacked || state.contractSeasonsLeft > 0) return state;
  const option = CONTRACT_OPTIONS.find((o) => o.years === years);
  if (!option) return state;
  const boardConfidence = applyConfidence(state.boardConfidence, option.confidenceDelta);
  const ambition = state.ambition + option.ambitionDelta;
  return {
    ...state,
    contractSeasonsLeft: option.years,
    boardConfidence,
    ambition,
    objective: divisionObjective(myClub(state).division, state.difficulty, ambition),
  };
}

/** 진행 중 시즌의 리그 득점 순위(라이브). */
export function liveTopScorers(state: GameState, n = 10): PlayerSeasonStat[] {
  if (!state.live) return [];
  return engineTopScorers(aggregatePlayerStats(state.live.results), n);
}

/** 특정 선수의 진행 중 시즌 최근 n경기 평점(라이브). live 없으면 빈 배열. */
export function playerForm(state: GameState, playerId: string, n = 5): PlayerFormEntry[] {
  if (!state.live) return [];
  return recentPlayerForm(state.live.results, playerId, n);
}

export type SeasonAwardKind = 'playerOfSeason' | 'topScorer' | 'goldenGlove';

/** 선수 개인 커리어 타임라인 항목. */
export type TimelineEntry =
  | { season: number; kind: 'transfer'; fromClubName: string; toClubName: string; fee: number }
  | { season: number; kind: 'milestone'; milestoneKind: 'apps' | 'goals'; value: number }
  | { season: number; kind: 'retired'; finalAge: number; careerApps: number; careerGoals: number; caps: number }
  | { season: number; kind: 'award'; awardKind: SeasonAwardKind };

/**
 * 한 선수의 커리어 타임라인(이적·통산 마일스톤·은퇴)을 시즌순으로 재구성.
 * 이미 history/legends에 영구 기록된 데이터만 사용 — 새 상태를 추가하지 않는다.
 * 이적은 리그 전체 기록이라 어느 선수든 나오지만, 마일스톤·은퇴는 내 구단
 * 소속이었던 시즌만 기록되므로(app 레이어 필터) 그 범위에서만 정확하다.
 */
export function playerTimeline(state: GameState, playerId: string): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const s of state.history) {
    for (const d of s.transfers) {
      if (d.playerId === playerId) {
        entries.push({ season: s.season, kind: 'transfer', fromClubName: d.fromClubName, toClubName: d.toClubName, fee: d.fee });
      }
    }
    for (const m of s.milestones ?? []) {
      if (m.playerId === playerId) {
        entries.push({ season: s.season, kind: 'milestone', milestoneKind: m.kind, value: m.value });
      }
    }
    if (s.awards.playerOfSeason?.playerId === playerId) {
      entries.push({ season: s.season, kind: 'award', awardKind: 'playerOfSeason' });
    }
    if (s.awards.topScorer?.playerId === playerId) {
      entries.push({ season: s.season, kind: 'award', awardKind: 'topScorer' });
    }
    if (s.awards.goldenGlove?.playerId === playerId) {
      entries.push({ season: s.season, kind: 'award', awardKind: 'goldenGlove' });
    }
  }
  const legend = state.legends.find((l) => l.playerId === playerId);
  if (legend) {
    entries.push({
      season: legend.season, kind: 'retired',
      finalAge: legend.finalAge, careerApps: legend.careerApps, careerGoals: legend.careerGoals, caps: legend.caps,
    });
  }
  return entries.sort((a, b) => a.season - b.season);
}

/** 선수의 시즌별 평균 평점 이력(내 구단 소속으로 출전한 시즌만, 시즌순). */
export function playerRatingHistory(state: GameState, playerId: string): SeasonRatingEntry[] {
  return state.ratingHistory[playerId] ?? [];
}

/** 시즌 평점 표준편차 기준. 이 미만이면 꾸준함(steady), 이상이면 기복(volatile)으로 본다. */
const FORM_STABILITY_STDDEV = 0.15;

/**
 * 시즌별 평점 이력의 변동성으로 폼 안정성을 평가. 최소 3시즌 데이터가 있어야
 * 의미 있는 판단이 가능하므로, 그 미만이면 null(판단 보류).
 */
export function formStability(history: SeasonRatingEntry[]): 'steady' | 'volatile' | null {
  if (history.length < 3) return null;
  const ratings = history.map((h) => h.avgRating);
  const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  const variance = ratings.reduce((a, b) => a + (b - mean) ** 2, 0) / ratings.length;
  return Math.sqrt(variance) < FORM_STABILITY_STDDEV ? 'steady' : 'volatile';
}

/**
 * 스카우팅 레벨에 따라 선수 잠재력(PA) 공개 정도를 결정.
 * 이적 시장(협상 모달)뿐 아니라 선수 상세 화면에서도 공유해서 써야
 * "이름 클릭 한 번으로 스카우팅 안개를 우회"하는 일이 없다 — 내 구단 소속
 * 선수는 항상 안개가 없으므로 호출부에서 scouting=20(만개)을 넘긴다.
 * scouted=true면(B13, 그 선수를 개별 파견 정찰했음) 구단 전체 스카우팅 레벨과
 * 무관하게 항상 정확한 값을 보여준다.
 */
export function revealPotential(scouting: number, potential: number, scouted = false): string {
  if (scouted || scouting >= 15) return potential.toFixed(0);
  if (scouting >= 8) {
    const band = 12 - Math.round((scouting - 8) * 1.2); // 8→12, 14→5 폭
    const lo = Math.max(0, Math.round(potential - band));
    const hi = Math.round(potential + band);
    return `${lo}~${hi}`;
  }
  return '?';
}

/** 특정 선수를 파견 정찰했는지(B13) — 내 구단 기준. */
export function isScouted(state: GameState, playerId: string): boolean {
  return myClub(state).scoutedPlayerIds?.includes(playerId) ?? false;
}

/** 선수 한 명을 지목해 스카우트 파견(보유 자금 사용, B13) — 성공하면 이후 항상
 *  정확한 PA를 볼 수 있다(구단 전체 스카우팅 레벨과 무관, 영구 등록). */
export function dispatchScoutAction(state: GameState, playerId: string): ActionOutcome {
  const club = myClub(state);
  const r = engineDispatchScout(club, playerId);
  if (!r.ok) return { state, ok: false, message: r.reason! };
  return {
    state: { ...state }, ok: true,
    message: `스카우트 파견 완료 — 이제 이 선수의 PA를 정확히 알 수 있습니다 (−${formatMoney(r.cost!)})`,
  };
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
  /** 컵 경기일 때 이번 라운드 이름("결승" 등). 리그 경기는 undefined. */
  cupRoundName?: string;
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
  const opponent = userIsHome ? awayClub : homeClub;
  const isBigMatch = opponent.id === state.rivalClubId;
  const setup: MatchSetup = {
    home: {
      club: homeClub,
      tactic: userIsHome ? userTactic : defaultTactic(homeClub, { opponent: awayClub, isHome: true, isBigMatch }),
    },
    away: {
      club: awayClub,
      tactic: userIsHome ? defaultTactic(awayClub, { opponent: homeClub, isHome: false, isBigMatch }) : userTactic,
    },
    seed: live.baseSeed + idx,
    isBigMatch,
  };
  return { setup, userIsHome, opponent };
}

// ── 경기 프리뷰 (관전 전 스카우팅) ──────────────────────────

export interface TeamPreview {
  clubId: string;
  name: string;
  isMine: boolean;
  /** 현재 리그 순위(1부터). 결과가 없으면 null. */
  position: number | null;
  strength: TeamStrength;
  /** 예상 포메이션 — 포메이션 상성 안내에 사용. */
  formation: string;
  form: FormSummary;
  /** 예상 선발 중 CA 최고 선수. */
  keyPlayer: { name: string; ca: number } | null;
  /** 키플레이어의 스카우팅 리포트(강점/약점) — 상대는 내 스카우팅 등급에 따라 표기. */
  keyPlayerReport: ScoutingReport | null;
}

export interface MatchPreview {
  home: TeamPreview;
  away: TeamPreview;
}

/** 선발(전술 라인업) 중 현재 능력 최고 선수. */
function keyPlayerOf(club: Club, tactic: Tactic): Player | null {
  const byId = new Map(club.players.map((p) => [p.id, p]));
  let best: Player | null = null;
  let bestCa = -1;
  for (const slot of tactic.lineup) {
    const p = byId.get(slot.playerId);
    if (!p) continue;
    const ca = currentAbility(p);
    if (ca > bestCa) { best = p; bestCa = ca; }
  }
  return best;
}

/** 셋업(양 팀 전술)으로 프리뷰 구성. 폼·순위는 진행 중 리그 결과 기준. */
function buildPreviewFrom(state: GameState, setup: MatchSetup): MatchPreview | null {
  if (!state.live) return null;
  const results = state.live.results;
  const table = liveTable(state);
  const myScouting = state.clubs.find((c) => c.id === state.myClubId)?.staff.scouting ?? 10;
  const posOf = (clubId: string): number | null => {
    if (results.length === 0) return null;
    const i = table.findIndex((r) => r.clubId === clubId);
    return i < 0 ? null : i + 1; // 타 부 상대는 순위 정보 없음(null)
  };
  const build = (club: Club, tactic: Tactic, opponentFormation: string): TeamPreview => {
    const isMine = club.id === state.myClubId;
    const kp = keyPlayerOf(club, tactic);
    return {
      clubId: club.id,
      name: club.name,
      isMine,
      position: posOf(club.id),
      strength: computeTeamStrength(club, tactic, false, opponentFormation),
      formation: tactic.formation,
      form: recentForm(results, club.id, 5),
      keyPlayer: kp ? { name: kp.name, ca: Math.round(currentAbility(kp)) } : null,
      keyPlayerReport: kp ? buildScoutingReport(kp, isMine ? 20 : myScouting) : null,
    };
  };
  return {
    home: build(setup.home.club, setup.home.tactic, setup.away.tactic.formation),
    away: build(setup.away.club, setup.away.tactic, setup.home.tactic.formation),
  };
}

/** 관전 예정 리그 경기의 프리뷰(전력·폼·순위·키플레이어). */
export function matchPreview(state: GameState): MatchPreview | null {
  const ws = watchSetup(state);
  return ws ? buildPreviewFrom(state, ws.setup) : null;
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

  // 관전 결과가 실제 이번 라운드의 내 픽스처와 일치하는지 확인 — 오래된/잘못된
  // MatchResult가 주입되면 순위표·통계가 조용히 오염될 수 있어 조기에 드러낸다.
  const userFx = ss.fixtures.find(
    (f, i) => i >= ss.cursor && f.round === round &&
      (f.homeId === state.myClubId || f.awayId === state.myClubId),
  );
  if (userFx && (watched.homeClubId !== userFx.homeId || watched.awayClubId !== userFx.awayId)) {
    throw new Error('commitWatchedRound: 관전 결과가 이번 라운드의 내 픽스처와 일치하지 않습니다.');
  }

  const userTactic = myTactic(state);
  while (ss.cursor < ss.fixtures.length && ss.fixtures[ss.cursor]!.round === round) {
    const fx = ss.fixtures[ss.cursor]!;
    const homeClub = clubById(fx.homeId);
    const awayClub = clubById(fx.awayId);
    const isUser = fx.homeId === state.myClubId || fx.awayId === state.myClubId;
    // 이 라운드의 다른 경기 중 내 라이벌 구단이 낀 대결도 빅매치로 반영(관전 중인
    // 내 경기와 동일한 기준 — rivalClubId는 내 구단 기준 단일 라이벌이라, 상대측
    // 관점에서도 완벽하진 않지만 기존 개념을 그대로 확장한 것).
    const isBigMatch = fx.homeId === state.rivalClubId || fx.awayId === state.rivalClubId;
    const homeTactic = fx.homeId === state.myClubId
      ? userTactic : defaultTactic(homeClub, { opponent: awayClub, isHome: true, isBigMatch });
    const awayTactic = fx.awayId === state.myClubId
      ? userTactic : defaultTactic(awayClub, { opponent: homeClub, isHome: false, isBigMatch });
    const result = isUser
      ? watched
      : simulateMatch({
          home: { club: homeClub, tactic: homeTactic },
          away: { club: awayClub, tactic: awayTactic },
          seed: ss.baseSeed + ss.cursor,
          isBigMatch,
        });
    // playNext와 동일한 난수 스킴으로 상태 변화 반영(관전/자동 일관성)
    applyMatchEffects(homeClub, homeTactic, awayClub, awayTactic, result,
      new Rng(ss.baseSeed * 2 + ss.cursor + 7919));
    commitResult(ss, result);
  }
  return { ...state, live: { ...state.live, results: ss.results, cursor: ss.cursor } };
}

// ── 컵 경기 관전 ────────────────────────────────────────────

/** 다음 컵 라운드에서 내 경기를 관전하기 위한 셋업. 부전승·탈락·컵 종료면 null. */
export function watchCupSetup(state: GameState): WatchSetup | null {
  if (!state.cup || isCupOver(state.cup)) return null;
  const next = nextCupPairings(state.cup, state.clubs);
  if (!next) return null;
  const pr = next.pairings.find((p) => p.homeId === state.myClubId || p.awayId === state.myClubId);
  if (!pr) return null; // 부전승이거나 이미 탈락

  const clubById = (id: string) => state.clubs.find((c) => c.id === id)!;
  const homeClub = clubById(pr.homeId);
  const awayClub = clubById(pr.awayId);
  const userIsHome = pr.homeId === state.myClubId;
  const userTactic = myTactic(state);
  const opponent = userIsHome ? awayClub : homeClub;
  const isBigMatch = opponent.id === state.rivalClubId || next.roundName === CUP_FINAL_ROUND_NAME;
  const setup: MatchSetup = {
    home: {
      club: homeClub,
      tactic: userIsHome ? userTactic : defaultTactic(homeClub, { opponent: awayClub, isHome: true, isBigMatch }),
    },
    away: {
      club: awayClub,
      tactic: userIsHome ? defaultTactic(awayClub, { opponent: homeClub, isHome: false, isBigMatch }) : userTactic,
    },
    seed: pr.seed,
    isBigMatch,
  };
  return {
    setup, userIsHome, opponent, cupRoundName: next.roundName,
  };
}

/** 관전 예정 컵 경기의 프리뷰. 폼·순위는 진행 중 리그 기준(타 부 상대는 미표시). */
export function cupPreview(state: GameState): MatchPreview | null {
  const ws = watchCupSetup(state);
  return ws ? buildPreviewFrom(state, ws.setup) : null;
}

/** 관전한 컵 경기 결과로 컵 라운드 전체를 커밋(내 경기는 watched, 나머지는 시뮬). */
export function commitWatchedCupRound(state: GameState, watched: MatchResult): GameState {
  if (!state.cup) return state;
  const cup = enginePlayCupRound(state.cup, state.clubs, tacticMap(state), watched);
  return { ...state, cup };
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
