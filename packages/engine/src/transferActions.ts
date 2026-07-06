/**
 * 사용자 주도 이적 액션 (economy.md 5장 — 플레이어 직접 영입/판매/방출).
 * AI 이적(transfer.ts)과 분리. 프리시즌에 호출되며 구단 객체를 직접 변경한다.
 */
import type { Club, Line, Player, AddOnConditionKind, AddOnTier } from './types.js';
import { lineOf } from './teamStrength.js';
import { currentAbility } from './derived.js';
import { marketValue, weeklyWage, agentFee } from './valuation.js';
import { clamp, hashSeed } from './math.js';
import { hasTrait } from './traits.js';

// ── 에이전트 개성 (A3) ────────────────────────────────────

export type AgentPersonality = 'hardliner' | 'moderate' | 'flexible';

/** 강경파로 분류되는 현재 능력(CA) 기준 — 이 이상이면 에이전트가 배짱을 부린다. */
const HARDLINER_CA_THRESHOLD = 165;
/** 유연한 편으로 분류되는 나이·능력 상한 — 둘 다 충족해야 한다(무명 유망주). */
const FLEXIBLE_MAX_AGE = 20;
const FLEXIBLE_CA_THRESHOLD = 120;

/**
 * 에이전트 개성 — 별도 저장 필드 없이 선수 프로필에서 결정론적으로 파생한다(신규 RNG
 * 소비가 없어 기존 세이브와도 완전히 호환). 다혈질 특성 보유자나 CA 상위 선수는 에이전트도
 * 강경하게 협상하는 경향, 반대로 어리고 무명인 유망주는 에이전트도 유연한 편이다.
 */
export function agentPersonality(player: Player): AgentPersonality {
  if (hasTrait(player, 'hothead') || currentAbility(player) >= HARDLINER_CA_THRESHOLD) return 'hardliner';
  if (player.age <= FLEXIBLE_MAX_AGE && currentAbility(player) < FLEXIBLE_CA_THRESHOLD) return 'flexible';
  return 'moderate';
}

/** 개성별 호가 프리미엄 배율. */
const ASKING_PREMIUM: Record<AgentPersonality, number> = { hardliner: 1.06, moderate: 1.0, flexible: 0.96 };
/** 개성별 협상 하한 비율(호가 대비) — 이 미만 제안은 거절. */
const FLOOR_RATIO: Record<AgentPersonality, number> = { hardliner: 0.9, moderate: 0.82, flexible: 0.72 };
/** 개성별 역제안 시 호가 쪽으로 얼마나 버티는지(1에 가까울수록 거의 양보하지 않음). */
const COUNTER_RIGIDITY: Record<AgentPersonality, number> = { hardliner: 0.7, moderate: 0.5, flexible: 0.3 };

// ── 에이전트 관계 지수 (신규 개선 항목 6) ──────────────────

export const AGENT_RELATIONS_MIN = 0;
export const AGENT_RELATIONS_MAX = 100;
/** 관계 지수가 아직 없는(구버전 세이브 등) 구단의 중립 기준값. */
export const AGENT_RELATIONS_DEFAULT = 50;
/** 협상 없이 산 구단(역제안까지 거쳐 타결)이 얻는 관계 상승폭. */
const AGENT_RELATIONS_BUY_GAIN = 2;
/** 협상이 완전히 결렬됐을 때(라운드 소진) 잃는 관계 하락폭 — 상승보다 훨씬 크게 잡아
 *  "관계는 쌓기 어렵고 깨지기 쉽다"는 방향으로 설계한다. */
export const AGENT_RELATIONS_BREAKDOWN_PENALTY = 8;
/** 관계 지수 편차(중립 대비) 1점당 하한 비율·역제안 완고함에 주는 보정폭. */
const AGENT_RELATIONS_ADJ_PER_POINT = 0.001;
/** 시즌마다 거래가 없던 상대 구단과의 관계가 중립으로 회귀하는 비율(고도화 항목1). */
export const AGENT_RELATIONS_DECAY_RATIO = 0.1;

/** 구단의 특정 상대 구단(협상 상대 선수의 소속 구단)에 대한 현재 에이전트 관계 지수(없으면 중립값). */
export function agentRelationsOf(club: Club, counterpartClubId: string): number {
  return clamp(
    club.agentRelationsByClub?.[counterpartClubId] ?? AGENT_RELATIONS_DEFAULT,
    AGENT_RELATIONS_MIN, AGENT_RELATIONS_MAX,
  );
}

/** 관계 지수가 협상에 주는 보정치 — 중립(50)보다 좋으면 양수(하한↓·완고함↓), 나쁘면 음수. */
function agentRelationsAdjustment(club: Club, counterpartClubId: string): number {
  return (agentRelationsOf(club, counterpartClubId) - AGENT_RELATIONS_DEFAULT) * AGENT_RELATIONS_ADJ_PER_POINT;
}

/** 특정 상대 구단과의 관계 지수를 delta만큼 조정(0~100 clamp), 구단 객체를 직접 변경. */
function adjustAgentRelations(club: Club, counterpartClubId: string, delta: number): void {
  const next = clamp(agentRelationsOf(club, counterpartClubId) + delta, AGENT_RELATIONS_MIN, AGENT_RELATIONS_MAX);
  club.agentRelationsByClub = { ...(club.agentRelationsByClub ?? {}), [counterpartClubId]: next };
}

/** 협상이 완전히 결렬됐을 때(evaluateOffer의 roundsExhausted) 호출 — 그 상대 구단과의
 *  관계만 깎인다(다른 구단과의 관계는 무관). */
export function applyNegotiationBreakdownPenalty(club: Club, counterpartClubId: string): void {
  adjustAgentRelations(club, counterpartClubId, -AGENT_RELATIONS_BREAKDOWN_PENALTY);
}

/**
 * 매 시즌 오프시즌에 호출 — 이번 시즌 거래가 없던 상대 구단과의 관계는 서서히 중립으로
 * 회귀한다(고도화 항목1: 나쁜 관계도 시간이 지나면 서서히 풀리고, 좋은 관계도 계속
 * 거래하지 않으면 서서히 식는다). 충분히 중립에 가까워진 항목은 기록에서 지워
 * 데이터가 무한정 쌓이지 않게 한다.
 */
export function decayAgentRelations(club: Club): void {
  const map = club.agentRelationsByClub;
  if (!map) return;
  const next: Record<string, number> = {};
  for (const [counterpartClubId, value] of Object.entries(map)) {
    const gap = AGENT_RELATIONS_DEFAULT - value;
    if (gap === 0) continue;
    // 정수 반올림만으로는 중립 근처에서 고정점(예: 55 ↔ 54.5 반올림)에 갇혀 영영
    // 수렴하지 못할 수 있어, 최소 1점은 항상 중립 쪽으로 움직이고 목표를 넘지 않게 clamp한다.
    const step = Math.sign(gap) * Math.max(1, Math.round(Math.abs(gap) * AGENT_RELATIONS_DECAY_RATIO));
    const decayed = gap > 0 ? Math.min(value + step, AGENT_RELATIONS_DEFAULT) : Math.max(value + step, AGENT_RELATIONS_DEFAULT);
    if (decayed !== AGENT_RELATIONS_DEFAULT) next[counterpartClubId] = decayed;
  }
  club.agentRelationsByClub = next;
}

export type AgentRelationsTier = 'excellent' | 'good' | 'neutral' | 'poor' | 'hostile';

/** 관계 지수를 5단계 등급으로 분류(UI 표시용). */
export function agentRelationsTier(relations: number): AgentRelationsTier {
  if (relations >= 80) return 'excellent';
  if (relations >= 60) return 'good';
  if (relations >= 40) return 'neutral';
  if (relations >= 20) return 'poor';
  return 'hostile';
}

/** 이적으로 새 구단에 합류할 때 등번호 배정 — 기존 번호가 새 구단에서 비어있으면
 *  유지하고, 겹치면 가장 작은 빈 번호로(협상에 무작위성을 추가하지 않기 위해
 *  Rng 없이 결정론적으로 처리). */
function reassignSquadNumber(club: Club, player: Player): void {
  const used = new Set(
    club.players.filter((p) => p.id !== player.id).map((p) => p.squadNumber).filter((n): n is number => n !== undefined),
  );
  if (player.squadNumber !== undefined && !used.has(player.squadNumber)) return;
  for (let n = 1; n <= 99; n++) {
    if (!used.has(n)) { player.squadNumber = n; return; }
  }
  player.squadNumber = undefined;
}

/** 스쿼드 크기 제약. */
export const MIN_SQUAD = 14;
export const MAX_SQUAD = 30;
/** 강제 판매 시 시장가 대비 회수율(즉시 매각 할인). */
const SELL_RATIO = 0.92;

/** 라인별 매각 후 최소 잔존 인원(전체 스쿼드 하한과 별개로 포지션 씨가 마르는 것을 방지).
 *  골키퍼는 보유 인원 자체가 적으므로 하한을 낮게 둔다. AI 간 이적(transfer.ts)의
 *  "라인당 3명 초과만 판매" 관행을 유저가 사는 경로에도 동일하게 적용한다. */
const MIN_LINE_DEPTH: Record<Line, number> = { GK: 1, DEF: 3, MID: 3, ATT: 3 };

/** 이 선수를 매도해도 매도 구단의 해당 포지션 라인이 바닥나지 않는지 확인. */
function sellerLineDepthOk(seller: Club, player: Player): boolean {
  const line = lineOf(player.position);
  const count = seller.players.filter((p) => lineOf(p.position) === line).length;
  return count - 1 >= MIN_LINE_DEPTH[line];
}

export interface TransferTarget {
  player: Player;
  clubId: string;
  clubName: string;
  value: number;
}

/** 영입 가능한 타 구단 선수 목록 (가치 포함). */
export function transferTargets(clubs: Club[], myClubId: string): TransferTarget[] {
  const out: TransferTarget[] = [];
  for (const club of clubs) {
    if (club.id === myClubId) continue;
    for (const player of club.players) {
      out.push({ player, clubId: club.id, clubName: club.name, value: marketValue(player) });
    }
  }
  return out;
}

export interface BuyResult { ok: boolean; fee?: number; agentFee?: number; playerName?: string; reason?: string }

/** 신규 계약 시 부여되는 계약 연수(에이전트 수수료 산정 기준). */
const NEW_CONTRACT_YEARS = 4;

/**
 * 매도 구단의 호가(asking price).
 * 시장가(marketValue — 이미 잔여 계약 할인이 반영됨)에 선수 중요도(포지션 내 서열)만
 * 추가로 반영한다. 계약 할인을 여기서 다시 곱하면 marketValue의 contractFactor와
 * 이중으로 적용돼 만료 임박 선수가 실제 가치의 절반 이하로 거래되므로 주의.
 * 핵심 선수는 프리미엄, 뎁스 여유가 있으면 소폭 할인.
 */
export function askingPrice(seller: Club, player: Player): number {
  const line = lineOf(player.position);
  const sameLine = seller.players
    .filter((p) => lineOf(p.position) === line)
    .sort((a, b) => currentAbility(b) - currentAbility(a));
  const rank = sameLine.findIndex((p) => p.id === player.id); // 0 = 그 라인 최고
  const depth = sameLine.length;

  let importance = 1.0;
  if (rank === 0) importance = 1.4;       // 핵심 → 프리미엄
  else if (rank === 1) importance = 1.15; // 준주전
  if (depth >= 4 && rank >= 2) importance *= 0.9; // 뎁스 여유 → 할인

  return Math.round(marketValue(player) * importance * ASKING_PREMIUM[agentPersonality(player)]);
}

export type OfferOutcome = 'accepted' | 'countered' | 'rejected' | 'lostToRival';

export interface OfferEvaluation {
  /** 협상 자체가 성립하는지(스쿼드·예산·매물 유효성). */
  ok: boolean;
  reason?: string;
  outcome?: OfferOutcome;
  /** 매도 구단 호가(제안 시 공개, 라운드가 진행될수록 조급증이 반영돼 소폭 상승). */
  asking?: number;
  /** 역제안 금액(countered일 때). */
  counter?: number;
  playerName?: string;
  /** 이번 제안이 몇 번째 라운드였는지(0-base). */
  round?: number;
  /** 라운드 상한 소진으로 협상이 완전히 결렬됐는지(재역제안 없이 거절). */
  roundsExhausted?: boolean;
  /** 경쟁 입찰(신규 개선 항목 9)로 다른 구단에 선수를 빼앗겼을 때만(outcome==='lostToRival') 채워진다. */
  rivalClubId?: string;
  rivalClubName?: string;
  rivalBid?: number;
}

/** 밀당 가능한 최대 라운드 수 — 이 이상 역제안이 반복되면 매도 구단이 협상을 접는다. */
export const MAX_NEGOTIATION_ROUNDS = 3;
/** 라운드가 진행될수록(=계속 낮은 제안이 반복될수록) 매도 구단이 조급해하며 호가에 얹는 가산율. */
const NEGOTIATION_IMPATIENCE_PER_ROUND = 0.03;

// ── 경쟁 입찰 (신규 개선 항목 9) ────────────────────────────

/** 경쟁 입찰이 발동할 수 있는 최소 라운드 — 첫 제안(0라운드)은 안전하게 보장한다. */
const RIVAL_BID_MIN_ROUND = 1;
/** 경쟁 입찰 발동 기준 확률(RIVAL_BID_MIN_ROUND일 때) — 라운드가 늘수록 가산돼 상한까지 커진다. */
const RIVAL_BID_BASE_CHANCE = 0.12;
const RIVAL_BID_PER_ROUND = 0.06;
const RIVAL_BID_MAX_CHANCE = 0.35;

/**
 * 매도 구단·나를 제외한 구단 중 호가를 감당할 수 있는(transferBudget 충분) 곳 가운데
 * 예산이 가장 큰 곳을 라이벌 입찰자로 고른다 — RNG 없이 결정론적이라 같은 상황이면
 * 항상 같은 구단이 나선다.
 */
function pickRivalBidder(clubs: Club[], myClubId: string, sellerClubId: string, asking: number): Club | undefined {
  const candidates = clubs
    .filter((c) => c.id !== myClubId && c.id !== sellerClubId && c.finance.transferBudget >= asking)
    .sort((a, b) => b.finance.transferBudget - a.finance.transferBudget || a.id.localeCompare(b.id));
  return candidates[0];
}

/**
 * 제안액에 대한 매도 구단의 반응(순수 함수 — 구단을 변경하지 않음).
 * 호가 이상이면 수락, 하한 이상이면 역제안, 그 미만이면 거절.
 * round(0-base, 이 협상에서 이미 진행된 역제안 횟수)가 클수록 호가가 조금씩 오르고,
 * MAX_NEGOTIATION_ROUNDS를 넘기면 매도 구단이 더 이상 밀당하지 않고 협상을 접는다.
 */
export function evaluateOffer(
  clubs: Club[], myClubId: string, playerId: string, offer: number, round = 0,
): OfferEvaluation {
  const me = clubs.find((c) => c.id === myClubId);
  if (!me) return { ok: false, reason: '내 구단을 찾을 수 없습니다.' };
  if (me.players.length >= MAX_SQUAD) {
    return { ok: false, reason: `스쿼드가 가득 찼습니다 (최대 ${MAX_SQUAD}명).` };
  }
  const seller = clubs.find((c) => c.id !== myClubId && c.players.some((p) => p.id === playerId));
  if (!seller) return { ok: false, reason: '해당 선수를 찾을 수 없습니다.' };
  if (seller.players.length - 1 < MIN_SQUAD) {
    return { ok: false, reason: '상대 구단이 최소 스쿼드 인원을 유지하려 합니다.' };
  }
  const player = seller.players.find((p) => p.id === playerId)!;
  if (!sellerLineDepthOk(seller, player)) {
    return { ok: false, reason: '상대 구단이 해당 포지션 자원을 유지하려 합니다.' };
  }
  if (player.loanFromClubId) return { ok: false, reason: '임대 중인 선수는 거래할 수 없습니다.' };
  if (!(offer > 0)) return { ok: false, reason: '제안액을 입력하세요.' };
  if (offer > me.finance.transferBudget) return { ok: false, reason: '이적 예산을 초과했습니다.' };
  if (offer > me.finance.balance) return { ok: false, reason: '보유 자금이 부족합니다.' };

  const personality = agentPersonality(player);
  const impatience = 1 + Math.min(round, MAX_NEGOTIATION_ROUNDS) * NEGOTIATION_IMPATIENCE_PER_ROUND;
  const asking = Math.round(askingPrice(seller, player) * impatience);
  // 관계 지수가 좋을수록(신규 개선 항목 6, 고도화 항목1: 이 매도 구단 한정) 하한이
  // 낮아지고 역제안도 덜 완고해진다.
  const relationsAdj = agentRelationsAdjustment(me, seller.id);
  const floorRatio = clamp(FLOOR_RATIO[personality] - relationsAdj, 0.5, 0.98);
  const floor = Math.round(asking * floorRatio);
  let outcome: OfferOutcome;
  let counter: number | undefined;
  let roundsExhausted = false;
  let rivalClubId: string | undefined;
  let rivalClubName: string | undefined;
  let rivalBid: number | undefined;

  if (offer >= asking) {
    outcome = 'accepted';
  } else {
    // 경쟁 입찰(신규 개선 항목 9) — 밀당이 길어질수록 다른 구단이 끼어들 확률이 오른다.
    // 내 제안이 라이벌의 입찰액 이상이면 아무리 확률이 맞아도 안전(=충분히 세게 불렀다).
    if (round >= RIVAL_BID_MIN_ROUND) {
      const roll = hashSeed(`${playerId}:${round}:rival`) / 0xFFFFFFFF;
      const chance = Math.min(
        RIVAL_BID_MAX_CHANCE,
        RIVAL_BID_BASE_CHANCE + (round - RIVAL_BID_MIN_ROUND) * RIVAL_BID_PER_ROUND,
      );
      if (roll < chance) {
        const rival = pickRivalBidder(clubs, myClubId, seller.id, asking);
        if (rival) {
          const premiumRoll = hashSeed(`${playerId}:${round}:rivalPremium`) % 15;
          const bid = Math.round(asking * (1 + premiumRoll / 100));
          if (offer < bid) {
            rivalClubId = rival.id;
            rivalClubName = rival.name;
            rivalBid = bid;
          }
        }
      }
    }

    if (rivalClubId) {
      outcome = 'lostToRival';
    } else if (round >= MAX_NEGOTIATION_ROUNDS) {
      outcome = 'rejected';
      roundsExhausted = true;
    } else if (offer >= floor) {
      outcome = 'countered';
      // 강경파일수록 호가에 가깝게, 유연한 편일수록 제안액에 가깝게 역제안한다.
      const rigidity = clamp(COUNTER_RIGIDITY[personality] - relationsAdj, 0.1, 0.9);
      counter = Math.min(asking, Math.round(offer + (asking - offer) * rigidity));
    } else {
      outcome = 'rejected';
    }
  }
  return {
    ok: true, outcome, asking, counter, playerName: player.name, round, roundsExhausted,
    rivalClubId, rivalClubName, rivalBid,
  };
}

/** 지정 이적료로 영입 실행 (협상 타결분). 예산·스쿼드 제약 검증. */
export function buyPlayerAt(clubs: Club[], myClubId: string, playerId: string, fee: number): BuyResult {
  const me = clubs.find((c) => c.id === myClubId);
  if (!me) return { ok: false, reason: '내 구단을 찾을 수 없습니다.' };
  if (me.players.length >= MAX_SQUAD) {
    return { ok: false, reason: `스쿼드가 가득 찼습니다 (최대 ${MAX_SQUAD}명).` };
  }
  const seller = clubs.find((c) => c.id !== myClubId && c.players.some((p) => p.id === playerId));
  if (!seller) return { ok: false, reason: '해당 선수를 찾을 수 없습니다.' };
  if (seller.players.length - 1 < MIN_SQUAD) {
    return { ok: false, reason: '상대 구단이 최소 스쿼드 인원을 유지하려 합니다.' };
  }
  const player = seller.players.find((p) => p.id === playerId)!;
  if (!sellerLineDepthOk(seller, player)) {
    return { ok: false, reason: '상대 구단이 해당 포지션 자원을 유지하려 합니다.' };
  }
  if (player.loanFromClubId) return { ok: false, reason: '임대 중인 선수는 거래할 수 없습니다.' };
  if (!(fee > 0)) return { ok: false, reason: '이적료가 올바르지 않습니다.' };
  // evaluateOffer와 동일한 하한(호가의 82%, 관계 지수로 보정) — 협상 없이 직접
  // buyPlayerAt을 호출해도 헐값에 선수를 사들이지 못하도록 매도 구단 쪽에서 다시 검증한다.
  const floorRatio = clamp(0.82 - agentRelationsAdjustment(me, seller.id), 0.5, 0.98);
  const floor = Math.round(askingPrice(seller, player) * floorRatio);
  if (fee < floor) {
    return { ok: false, reason: '제안액이 너무 낮아 거절당했습니다.' };
  }
  const commission = agentFee(fee, NEW_CONTRACT_YEARS);
  if (me.finance.transferBudget < fee) {
    return { ok: false, reason: '이적 예산이 부족합니다.' };
  }
  if (me.finance.balance < fee + commission) {
    return { ok: false, reason: '보유 자금이 부족합니다(이적료+에이전트 수수료).' };
  }

  me.finance.transferBudget -= fee;
  me.finance.balance -= fee + commission;
  seller.finance.balance += fee;
  seller.finance.transferBudget += fee;
  seller.players = seller.players.filter((p) => p.id !== playerId);
  player.contractYears = NEW_CONTRACT_YEARS;
  player.wage = weeklyWage(player);
  player.releaseClause = undefined;
  player.seasonsAtClub = 0; // 새 구단으로 이적(로열티 초기화, 신규 개선 항목 10)
  me.players.push(player);
  reassignSquadNumber(me, player);
  adjustAgentRelations(me, seller.id, AGENT_RELATIONS_BUY_GAIN);

  return { ok: true, fee, agentFee: commission, playerName: player.name };
}

export interface RivalSnipeResult {
  ok: boolean;
  reason?: string;
  playerName?: string;
  rivalClubName?: string;
  fee?: number;
}

/**
 * 경쟁 입찰(신규 개선 항목 9)로 놓친 선수를 실제로 라이벌 구단에 이적시킨다.
 * evaluateOffer 자체는 순수 함수라 상태를 바꾸지 않으므로, UI가 outcome==='lostToRival'
 * 결과를 받은 뒤 그 결과에 실린 rivalClubId·rivalBid를 그대로 넘겨 별도로 호출해야
 * 실제 이적이 확정된다(재계산 없이 협상 시점의 입찰액을 그대로 집행).
 */
export function executeRivalSnipe(clubs: Club[], rivalClubId: string, playerId: string, bid: number): RivalSnipeResult {
  const rival = clubs.find((c) => c.id === rivalClubId);
  if (!rival) return { ok: false, reason: '라이벌 구단을 찾을 수 없습니다.' };
  const seller = clubs.find((c) => c.id !== rivalClubId && c.players.some((p) => p.id === playerId));
  if (!seller) return { ok: false, reason: '해당 선수를 찾을 수 없습니다.' };
  const player = seller.players.find((p) => p.id === playerId)!;
  if (player.loanFromClubId) return { ok: false, reason: '임대 중인 선수는 거래할 수 없습니다.' };
  if (rival.players.length >= MAX_SQUAD) return { ok: false, reason: '라이벌 구단 스쿼드가 가득 찼습니다.' };
  if (seller.players.length - 1 < MIN_SQUAD) {
    return { ok: false, reason: '매도 구단이 최소 스쿼드 인원을 유지하려 합니다.' };
  }

  rival.finance.transferBudget -= bid;
  rival.finance.balance -= bid;
  seller.finance.balance += bid;
  seller.finance.transferBudget += bid;
  seller.players = seller.players.filter((p) => p.id !== playerId);
  player.contractYears = NEW_CONTRACT_YEARS;
  player.wage = weeklyWage(player);
  player.releaseClause = undefined;
  player.seasonsAtClub = 0; // 새 구단으로 이적(로열티 초기화, 신규 개선 항목 10)
  rival.players.push(player);
  reassignSquadNumber(rival, player);

  return { ok: true, playerName: player.name, rivalClubName: rival.name, fee: bid };
}

/**
 * 방출(바이아웃) 조항 이용 즉시 영입 — 협상 없이 조항 금액을 그대로 지불한다.
 * 매도 구단은 포지션 뎁스·선수 중요도를 이유로 거절할 수 없다(방출조항의 본질).
 * 다만 스쿼드 최소 인원(MIN_SQUAD)만은 시뮬레이션 무결성을 위해 예외적으로 유지한다.
 */
export function buyPlayerViaReleaseClause(clubs: Club[], myClubId: string, playerId: string): BuyResult {
  const me = clubs.find((c) => c.id === myClubId);
  if (!me) return { ok: false, reason: '내 구단을 찾을 수 없습니다.' };
  if (me.players.length >= MAX_SQUAD) {
    return { ok: false, reason: `스쿼드가 가득 찼습니다 (최대 ${MAX_SQUAD}명).` };
  }
  const seller = clubs.find((c) => c.id !== myClubId && c.players.some((p) => p.id === playerId));
  if (!seller) return { ok: false, reason: '해당 선수를 찾을 수 없습니다.' };
  if (seller.players.length - 1 < MIN_SQUAD) {
    return { ok: false, reason: '상대 구단이 최소 스쿼드 인원을 유지하려 합니다.' };
  }
  const player = seller.players.find((p) => p.id === playerId)!;
  if (player.loanFromClubId) return { ok: false, reason: '임대 중인 선수는 거래할 수 없습니다.' };
  const fee = player.releaseClause;
  if (fee === undefined) return { ok: false, reason: '이 선수는 방출조항이 없습니다.' };

  const commission = agentFee(fee, NEW_CONTRACT_YEARS);
  if (me.finance.transferBudget < fee) {
    return { ok: false, reason: '이적 예산이 부족합니다.' };
  }
  if (me.finance.balance < fee + commission) {
    return { ok: false, reason: '보유 자금이 부족합니다(이적료+에이전트 수수료).' };
  }

  me.finance.transferBudget -= fee;
  me.finance.balance -= fee + commission;
  seller.finance.balance += fee;
  seller.finance.transferBudget += fee;
  seller.players = seller.players.filter((p) => p.id !== playerId);
  player.contractYears = NEW_CONTRACT_YEARS;
  player.wage = weeklyWage(player);
  player.releaseClause = undefined;
  player.seasonsAtClub = 0; // 새 구단으로 이적(로열티 초기화, 신규 개선 항목 10)
  me.players.push(player);
  reassignSquadNumber(me, player);

  return { ok: true, fee, agentFee: commission, playerName: player.name };
}

/** 타 구단 선수 영입 (호가로 즉시 — AI/구버전 경로).
 *  marketValue만 내면 라인 내 핵심 선수(rank 0, importance 1.4배)는 buyPlayerAt의
 *  하한(호가의 82%)에 못 미쳐 항상 거절되므로, 반드시 askingPrice를 기준으로 낸다. */
export function buyPlayer(clubs: Club[], myClubId: string, playerId: string): BuyResult {
  const seller = clubs.find((c) => c.id !== myClubId && c.players.some((p) => p.id === playerId));
  if (!seller) return { ok: false, reason: '해당 선수를 찾을 수 없습니다.' };
  const player = seller.players.find((p) => p.id === playerId)!;
  return buyPlayerAt(clubs, myClubId, playerId, askingPrice(seller, player));
}

// ── 이적 마감시한 패닉 바이 (D-day 프리미엄, 신규 개선 항목 7) ─────

/** 패닉 바이 시 호가 위에 얹는 웃돈 배율 — 밀당을 포기하는 대신 확실하게 데려온다. */
export const PANIC_BUY_PREMIUM = 1.15;

/**
 * 협상이 결렬 직전이거나 시간이 없을 때 쓰는 마감시한 패닉 바이 — 호가에 웃돈
 * (PANIC_BUY_PREMIUM배)을 얹어 협상 없이 즉시 확정 영입한다. 내부적으로 buyPlayerAt을
 * 그대로 재사용하므로 예산·스쿼드 뎁스 검증과 관계 지수 상승(Item6)도 동일하게 적용된다.
 */
export function panicBuy(clubs: Club[], myClubId: string, playerId: string): BuyResult {
  const seller = clubs.find((c) => c.id !== myClubId && c.players.some((p) => p.id === playerId));
  if (!seller) return { ok: false, reason: '해당 선수를 찾을 수 없습니다.' };
  const player = seller.players.find((p) => p.id === playerId)!;
  const fee = Math.round(askingPrice(seller, player) * PANIC_BUY_PREMIUM);
  return buyPlayerAt(clubs, myClubId, playerId, fee);
}

export interface SellResult { ok: boolean; fee?: number; buyerName?: string; playerName?: string; reason?: string }

/** 내 선수 판매 (관심 있는 AI 구단에 즉시 매각, 시장가의 92%). */
export function sellPlayer(clubs: Club[], myClubId: string, playerId: string): SellResult {
  const me = clubs.find((c) => c.id === myClubId);
  if (!me) return { ok: false, reason: '내 구단을 찾을 수 없습니다.' };
  if (me.players.length <= MIN_SQUAD) {
    return { ok: false, reason: `최소 스쿼드 인원(${MIN_SQUAD}명)이라 판매할 수 없습니다.` };
  }
  const player = me.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, reason: '내 스쿼드에 없는 선수입니다.' };
  if (player.loanFromClubId) return { ok: false, reason: '임대 중인 선수는 거래할 수 없습니다.' };

  const fee = Math.round(marketValue(player) * SELL_RATIO);
  const line = lineOf(player.position);
  // 관심 구단: 예산 충분 + 스쿼드 여유. 해당 라인이 약한 구단을 우선, 그다음 예산순.
  const buyers = clubs
    .filter((c) => c.id !== myClubId && c.players.length < MAX_SQUAD && c.finance.transferBudget >= fee)
    .sort((a, b) => lineAbility(a, line) - lineAbility(b, line) || b.finance.transferBudget - a.finance.transferBudget);
  const buyer = buyers[0];
  if (!buyer) return { ok: false, reason: '관심 구단이 없습니다. 방출을 이용하세요.' };

  me.players = me.players.filter((p) => p.id !== playerId);
  me.finance.balance += fee;
  me.finance.transferBudget += fee;
  buyer.finance.balance -= fee;
  buyer.finance.transferBudget -= fee;
  player.contractYears = 4;
  player.wage = weeklyWage(player);
  player.releaseClause = undefined;
  player.seasonsAtClub = 0; // 새 구단으로 이적(로열티 초기화, 신규 개선 항목 10)
  buyer.players.push(player);
  reassignSquadNumber(buyer, player);

  return { ok: true, fee, buyerName: buyer.name, playerName: player.name };
}

export interface SellOffer { clubId: string; clubName: string; bid: number; }

/** 특정 라인의 평균 현재 능력(선수 없으면 0). */
function lineAbility(club: Club, line: ReturnType<typeof lineOf>): number {
  const ps = club.players.filter((p) => lineOf(p.position) === line);
  if (ps.length === 0) return 0;
  return ps.reduce((s, p) => s + currentAbility(p), 0) / ps.length;
}

/**
 * 내 선수에 대한 AI 구단들의 입찰 목록(순수 함수).
 * 관심·입찰액은 구단의 포지션 필요도·예산으로 결정론적으로 산출된다.
 * 업그레이드가 되는(라인 평균보다 나은) 선수일수록·뎁스가 얕을수록 높게 부른다.
 */
export function sellOffers(clubs: Club[], myClubId: string, playerId: string): SellOffer[] {
  const me = clubs.find((c) => c.id === myClubId);
  if (!me) return [];
  const player = me.players.find((p) => p.id === playerId);
  if (!player || player.loanFromClubId) return [];
  const mv = marketValue(player);
  const line = lineOf(player.position);
  const ca = currentAbility(player);

  const offers: SellOffer[] = [];
  for (const club of clubs) {
    if (club.id === myClubId) continue;
    if (club.players.length >= MAX_SQUAD) continue;
    if (club.finance.transferBudget < mv * 0.7) continue; // 예산 부족

    const lineCount = club.players.filter((p) => lineOf(p.position) === line).length;
    const gap = ca - lineAbility(club, line);  // 양수 = 전력 업그레이드
    const wants = gap > -8 || lineCount < 3;   // 향상 or 뎁스 부족일 때 관심
    if (!wants) continue;

    const need = clamp(0.9 + gap / 200, 0.85, 1.05);
    const bid = Math.min(Math.round(mv * need), club.finance.transferBudget);
    offers.push({ clubId: club.id, clubName: club.name, bid });
  }
  offers.sort((a, b) => b.bid - a.bid);
  return offers;
}

// ── 바이백 조항 (신규 개선 항목 2) ──────────────────────────

/** 바이백 조항 유효 기간(오프시즌 경계 기준 시즌 수). */
export const BUYBACK_MAX_SEASONS = 2;

/**
 * 특정 구단의 입찰을 수락해 판매 실행(입찰액은 sellOffers와 동일하게 결정론적).
 * buybackFee를 지정하면(판매가 이상이어야 함) 원 소속 구단(나)이 향후
 * BUYBACK_MAX_SEASONS 시즌 이내에 이 금액으로 되사올 수 있는 권리를 남긴다.
 */
export function acceptSellOffer(
  clubs: Club[], myClubId: string, playerId: string, buyerId: string, buybackFee?: number,
): SellResult {
  const me = clubs.find((c) => c.id === myClubId);
  if (!me) return { ok: false, reason: '내 구단을 찾을 수 없습니다.' };
  if (me.players.length <= MIN_SQUAD) {
    return { ok: false, reason: `최소 스쿼드 인원(${MIN_SQUAD}명)이라 판매할 수 없습니다.` };
  }
  const player = me.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, reason: '내 스쿼드에 없는 선수입니다.' };
  if (player.loanFromClubId) return { ok: false, reason: '임대 중인 선수는 거래할 수 없습니다.' };

  const offer = sellOffers(clubs, myClubId, playerId).find((o) => o.clubId === buyerId);
  if (!offer) return { ok: false, reason: '해당 구단의 제안이 유효하지 않습니다.' };
  const buyer = clubs.find((c) => c.id === buyerId)!;
  const fee = offer.bid;
  if (buybackFee !== undefined && buybackFee < fee) {
    return { ok: false, reason: '바이백 금액은 판매가 이상이어야 합니다.' };
  }

  me.players = me.players.filter((p) => p.id !== playerId);
  me.finance.balance += fee;
  me.finance.transferBudget += fee;
  buyer.finance.balance -= fee;
  buyer.finance.transferBudget -= fee;
  player.contractYears = 4;
  player.wage = weeklyWage(player);
  player.releaseClause = undefined;
  player.seasonsAtClub = 0; // 새 구단으로 이적(로열티 초기화, 신규 개선 항목 10)
  player.buybackClause = buybackFee !== undefined
    ? { clubId: myClubId, fee: buybackFee, seasonsRemaining: BUYBACK_MAX_SEASONS }
    : undefined;
  buyer.players.push(player);
  reassignSquadNumber(buyer, player);

  return { ok: true, fee, buyerName: buyer.name, playerName: player.name };
}

export interface BuybackResult { ok: boolean; fee?: number; sellerName?: string; playerName?: string; reason?: string }

/** 바이백 조항을 행사해 원 소속 구단이 조항 금액으로 즉시 재영입한다. */
export function exerciseBuyback(clubs: Club[], myClubId: string, playerId: string): BuybackResult {
  const me = clubs.find((c) => c.id === myClubId);
  if (!me) return { ok: false, reason: '내 구단을 찾을 수 없습니다.' };
  if (me.players.length >= MAX_SQUAD) {
    return { ok: false, reason: `스쿼드가 가득 찼습니다 (최대 ${MAX_SQUAD}명).` };
  }
  const currentClub = clubs.find((c) => c.id !== myClubId && c.players.some((p) => p.id === playerId));
  if (!currentClub) return { ok: false, reason: '해당 선수를 찾을 수 없습니다.' };
  const player = currentClub.players.find((p) => p.id === playerId)!;
  if (!player.buybackClause || player.buybackClause.clubId !== myClubId) {
    return { ok: false, reason: '이 선수에 대한 바이백 권리가 없습니다.' };
  }
  if (player.loanFromClubId) return { ok: false, reason: '임대 중인 선수는 거래할 수 없습니다.' };
  if (currentClub.players.length - 1 < MIN_SQUAD) {
    return { ok: false, reason: '상대 구단이 최소 스쿼드 인원을 유지하려 합니다.' };
  }
  const fee = player.buybackClause.fee;
  if (me.finance.transferBudget < fee) return { ok: false, reason: '이적 예산이 부족합니다.' };
  if (me.finance.balance < fee) return { ok: false, reason: '보유 자금이 부족합니다.' };

  me.finance.transferBudget -= fee;
  me.finance.balance -= fee;
  currentClub.finance.balance += fee;
  currentClub.finance.transferBudget += fee;
  currentClub.players = currentClub.players.filter((p) => p.id !== playerId);
  player.buybackClause = undefined;
  player.contractYears = 4;
  player.wage = weeklyWage(player);
  player.releaseClause = undefined;
  player.seasonsAtClub = 0; // 새 구단으로 이적(로열티 초기화, 신규 개선 항목 10)
  me.players.push(player);
  reassignSquadNumber(me, player);

  return { ok: true, fee, sellerName: currentClub.name, playerName: player.name };
}

export type BuybackRenegotiationDirection = 'increase' | 'decrease';

/** 재협상 1회당 바이백 금액이 오르내리는 비율(고도화 항목5). */
export const BUYBACK_RENEGOTIATION_STEP = 0.2;
/** 현재 구단이 "선수 가치가 크게 올랐다"며 인상을 요청할 수 있는 배율 기준
 *  (시가가 바이백 금액의 이 배율 이상이어야 정당하다고 받아들여진다). */
export const BUYBACK_VALUE_INCREASE_RATIO = 1.3;
/** 원 소속(권리 보유) 구단이 "선수 가치가 떨어졌다"며 인하를 요청할 수 있는 배율
 *  기준(시가가 바이백 금액의 이 배율 이하여야 정당하다고 받아들여진다). */
export const BUYBACK_VALUE_DECREASE_RATIO = 0.7;

export interface BuybackRenegotiationResult { ok: boolean; reason?: string; newFee?: number }

/**
 * 바이백 조항 금액 재협상(고도화 항목5) — 서명 시 고정됐던 금액을 시즌 중 한 번
 * 조정 요청할 수 있다. 현재 구단이 인상(increase)을 요청하면 선수의 시가가 조항
 * 금액보다 충분히 올랐을 때만(그렇지 않으면 헐값에 놓아줄 이유가 없다는 논리)
 * 받아들여지고, 원 소속 구단이 인하(decrease)를 요청하면 시가가 조항 금액보다
 * 충분히 떨어졌을 때만(그래야 실제로 되사올 유인이 생긴다는 논리) 받아들여진다.
 * 시즌당 1회 제한.
 */
export function renegotiateBuybackClause(
  clubs: Club[], playerId: string, direction: BuybackRenegotiationDirection,
): BuybackRenegotiationResult {
  const currentClub = clubs.find((c) => c.players.some((p) => p.id === playerId));
  if (!currentClub) return { ok: false, reason: '해당 선수를 찾을 수 없습니다.' };
  const player = currentClub.players.find((p) => p.id === playerId)!;
  if (!player.buybackClause) return { ok: false, reason: '바이백 조항이 없는 선수입니다.' };
  if (player.buybackRenegotiatedThisSeason) {
    return { ok: false, reason: '이번 시즌에는 이미 바이백 조항 재협상을 시도했습니다.' };
  }
  player.buybackRenegotiatedThisSeason = true;
  const value = marketValue(player);
  const currentFee = player.buybackClause.fee;

  if (direction === 'increase') {
    if (value < currentFee * BUYBACK_VALUE_INCREASE_RATIO) {
      return { ok: false, reason: '선수 가치가 아직 크게 오르지 않아 원 소속 구단이 인상 요청을 거절했습니다.' };
    }
    const newFee = Math.round(currentFee * (1 + BUYBACK_RENEGOTIATION_STEP));
    player.buybackClause = { ...player.buybackClause, fee: newFee };
    return { ok: true, newFee };
  }
  if (value > currentFee * BUYBACK_VALUE_DECREASE_RATIO) {
    return { ok: false, reason: '선수 가치가 아직 충분히 떨어지지 않아 현재 구단이 인하 요청을 거절했습니다.' };
  }
  const newFee = Math.round(currentFee * (1 - BUYBACK_RENEGOTIATION_STEP));
  player.buybackClause = { ...player.buybackClause, fee: newFee };
  return { ok: true, newFee };
}

// ── 성과 기반 후불 이적료 (Add-on, 신규 개선 항목 3 → 고도화 항목4: 다단계화) ──

export interface AddOnAttachResult { ok: boolean; reason?: string }

/** Add-on 조항에 붙일 수 있는 최대 티어 수(고도화 항목4). */
export const ADD_ON_MAX_TIERS = 3;

export const ADD_ON_CONDITION_LABEL: Record<AddOnConditionKind, string> = {
  appearances: '출전', goals: '득점', assists: '도움', cleanSheets: '클린시트',
};

/** 선수의 이번 시즌 누적치 중 Add-on 조건 종류에 해당하는 값을 읽는다. */
export function addOnConditionValue(player: Player, kind: AddOnConditionKind): number {
  switch (kind) {
    case 'appearances': return player.seasonApps;
    case 'goals': return player.seasonGoals;
    case 'assists': return player.seasonAssists ?? 0;
    case 'cleanSheets': return player.seasonCleanSheets ?? 0;
  }
}

/**
 * 방금 판매한 선수에게 성과 기반 후불 이적료(Add-on) 조항을 붙인다 — 이번 시즌 새
 * 소속 구단에서 지정한 티어 조건(출전/득점/도움/클린시트 누적치)에 도달할 때마다
 * 그 티어 몫만큼 원 소속 구단에 추가 이적료가 지급된다(오프시즌 경계에 정산,
 * franchise.ts 참고). 여러 티어를 섞어 다단계 성과급을 구성할 수 있다(최대
 * ADD_ON_MAX_TIERS개). 판매 자체(이적료 정산)와 분리된 별도 호출이라
 * acceptSellOffer/buyPlayerAt 등 어떤 영입 경로 뒤에도 붙일 수 있다.
 */
export function attachAddOnClause(
  clubs: Club[], playerId: string, sellerClubId: string, tiers: AddOnTier[],
): AddOnAttachResult {
  if (tiers.length === 0) return { ok: false, reason: '조건을 하나 이상 지정해야 합니다.' };
  if (tiers.length > ADD_ON_MAX_TIERS) return { ok: false, reason: `조건은 최대 ${ADD_ON_MAX_TIERS}개까지 지정할 수 있습니다.` };
  if (tiers.some((t) => !(t.threshold > 0) || !(t.fee > 0))) {
    return { ok: false, reason: '조건 기준과 금액은 0보다 커야 합니다.' };
  }
  const club = clubs.find((c) => c.players.some((p) => p.id === playerId));
  if (!club) return { ok: false, reason: '선수를 찾을 수 없습니다.' };
  if (club.id === sellerClubId) return { ok: false, reason: '같은 구단에는 조항을 붙일 수 없습니다.' };
  const player = club.players.find((p) => p.id === playerId)!;
  player.addOnClause = { sellerClubId, tiers };
  return { ok: true };
}

/** 선수 방출 (수입 없음, 인건비 절감). */
export function releasePlayer(
  clubs: Club[], myClubId: string, playerId: string,
): { ok: boolean; playerName?: string; reason?: string } {
  const me = clubs.find((c) => c.id === myClubId);
  if (!me) return { ok: false, reason: '내 구단을 찾을 수 없습니다.' };
  if (me.players.length <= MIN_SQUAD) {
    return { ok: false, reason: `최소 스쿼드 인원(${MIN_SQUAD}명)이라 방출할 수 없습니다.` };
  }
  const player = me.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, reason: '내 스쿼드에 없는 선수입니다.' };
  if (player.loanFromClubId) return { ok: false, reason: '임대 중인 선수는 방출할 수 없습니다(원 소속 구단으로 복귀).' };
  me.players = me.players.filter((p) => p.id !== playerId);
  return { ok: true, playerName: player.name };
}

// ── 임대 이적 (A7) ────────────────────────────────────────

/** 임대 기간(시즌 수) 하한·상한. */
export const LOAN_MIN_SEASONS = 1;
export const LOAN_MAX_SEASONS = 2;

/** 의무완전이적 조항의 출전 기준(시즌 경기 수) 하한·상한. */
export const LOAN_OBLIGATION_MIN_APPS = 1;
export const LOAN_OBLIGATION_MAX_APPS = 40;

export interface LoanTerms {
  /** 임대 기간(시즌) — LOAN_MIN_SEASONS~LOAN_MAX_SEASONS로 clamp. */
  seasons: number;
  /** 임대료(만원). 0이면 무상 임대. */
  fee: number;
  /** 임대 기간 중 주급을 원 소속 구단이 분담하는 비율(0~1). */
  wageShareByParent: number;
  /** 의무완전이적 조항(선택) — 이번 임대 시즌 출전이 기준에 도달하면 완전 이적으로 전환. */
  buyObligation?: { appearances: number; fee: number };
  /** 우선매수옵션(선택, OTB, 신규 개선 항목 4) — 임대 구단이 임대 기간 중 언제든
   *  이 금액으로 완전 영입을 선택할 수 있다(의무완전이적과 달리 강제되지 않는다). */
  buyOption?: { fee: number };
}

export interface LoanResult { ok: boolean; playerName?: string; reason?: string; fee?: number; }

/**
 * 선수를 다른 구단으로 임대 보낸다 — 원 소속(fromClubId)은 유지한 채 실제 출전은
 * toClubId 소속으로 뛴다. 방향은 대칭적이라 "임대 보내기"(fromClubId=내 구단)와
 * "임대로 데려오기"(toClubId=내 구단) 모두 이 함수 하나로 처리한다.
 */
export function loanPlayerOut(
  clubs: Club[], fromClubId: string, toClubId: string, playerId: string, terms: LoanTerms,
): LoanResult {
  const from = clubs.find((c) => c.id === fromClubId);
  if (!from) return { ok: false, reason: '원 소속 구단을 찾을 수 없습니다.' };
  const to = clubs.find((c) => c.id === toClubId);
  if (!to) return { ok: false, reason: '임대 구단을 찾을 수 없습니다.' };
  if (from.id === to.id) return { ok: false, reason: '같은 구단으로는 임대할 수 없습니다.' };
  if (to.players.length >= MAX_SQUAD) {
    return { ok: false, reason: `상대 스쿼드가 가득 찼습니다 (최대 ${MAX_SQUAD}명).` };
  }
  if (from.players.length - 1 < MIN_SQUAD) {
    return { ok: false, reason: `최소 스쿼드 인원(${MIN_SQUAD}명)이라 임대를 보낼 수 없습니다.` };
  }
  const player = from.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, reason: '해당 선수를 찾을 수 없습니다.' };
  if (player.loanFromClubId) return { ok: false, reason: '이미 임대 중인 선수는 재임대할 수 없습니다.' };
  if (!sellerLineDepthOk(from, player)) {
    return { ok: false, reason: '해당 포지션 자원을 유지하려 합니다.' };
  }

  const seasons = clamp(Math.round(terms.seasons), LOAN_MIN_SEASONS, LOAN_MAX_SEASONS);
  const fee = Math.max(0, Math.round(terms.fee));
  const wageShare = clamp(terms.wageShareByParent, 0, 1);
  if (fee > 0) {
    if (to.finance.balance < fee) return { ok: false, reason: '상대 구단 자금이 부족합니다.' };
    to.finance.balance -= fee;
    from.finance.balance += fee;
  }

  from.players = from.players.filter((p) => p.id !== playerId);
  player.loanFromClubId = fromClubId;
  player.loanSeasonsRemaining = seasons;
  player.loanWageShareByParent = wageShare;
  player.loanBuyObligation = terms.buyObligation
    ? {
        appearances: clamp(Math.round(terms.buyObligation.appearances), LOAN_OBLIGATION_MIN_APPS, LOAN_OBLIGATION_MAX_APPS),
        fee: Math.max(0, Math.round(terms.buyObligation.fee)),
      }
    : undefined;
  player.loanBuyOption = terms.buyOption ? { fee: Math.max(0, Math.round(terms.buyOption.fee)) } : undefined;
  to.players.push(player);
  reassignSquadNumber(to, player);

  return { ok: true, playerName: player.name, fee };
}

/** 임대 중인 선수를 원 소속 구단이 시즌 중 즉시 회수한다(콜백 조항). */
export function recallLoanPlayer(clubs: Club[], playerId: string): LoanResult {
  const loanClub = clubs.find((c) => c.players.some((p) => p.id === playerId));
  if (!loanClub) return { ok: false, reason: '해당 선수를 찾을 수 없습니다.' };
  const player = loanClub.players.find((p) => p.id === playerId)!;
  if (!player.loanFromClubId) return { ok: false, reason: '임대 중인 선수가 아닙니다.' };
  const parent = clubs.find((c) => c.id === player.loanFromClubId);
  if (!parent) return { ok: false, reason: '원 소속 구단을 찾을 수 없습니다.' };

  loanClub.players = loanClub.players.filter((p) => p.id !== playerId);
  player.loanFromClubId = undefined;
  player.loanSeasonsRemaining = undefined;
  player.loanWageShareByParent = undefined;
  player.loanBuyObligation = undefined;
  player.loanBuyOption = undefined;
  parent.players.push(player);
  reassignSquadNumber(parent, player);

  return { ok: true, playerName: player.name };
}

export interface LoanBuyOptionResult { ok: boolean; playerName?: string; fee?: number; reason?: string; }

/**
 * 우선매수옵션(OTB, 신규 개선 항목 4) 행사 — 임대 중인 선수를 임대 구단이 정해진
 * 금액으로 즉시 완전 영입해 임대를 조기 종료한다. 의무완전이적과 달리 강제되지
 * 않으며, 임대 구단의 선택으로만 발동한다.
 */
export function exerciseLoanBuyOption(clubs: Club[], buyerClubId: string, playerId: string): LoanBuyOptionResult {
  const loanClub = clubs.find((c) => c.id === buyerClubId);
  if (!loanClub) return { ok: false, reason: '구단을 찾을 수 없습니다.' };
  const player = loanClub.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, reason: '해당 선수를 찾을 수 없습니다.' };
  if (!player.loanFromClubId) return { ok: false, reason: '임대 중인 선수가 아닙니다.' };
  if (!player.loanBuyOption) return { ok: false, reason: '우선매수옵션이 없는 선수입니다.' };
  const parent = clubs.find((c) => c.id === player.loanFromClubId);
  if (!parent) return { ok: false, reason: '원 소속 구단을 찾을 수 없습니다.' };

  const fee = player.loanBuyOption.fee;
  if (loanClub.finance.balance < fee) return { ok: false, reason: '자금이 부족합니다.' };

  loanClub.finance.balance -= fee;
  parent.finance.balance += fee;
  player.loanFromClubId = undefined;
  player.loanSeasonsRemaining = undefined;
  player.loanWageShareByParent = undefined;
  player.loanBuyObligation = undefined;
  player.loanBuyOption = undefined;

  return { ok: true, playerName: player.name, fee };
}

/**
 * 임대 주급 분담 정산 — 원 소속 구단이 임대 구단에 분담분을 실제로 이체한다.
 * settleSeason의 주급 지출 계산(club.players 기준)은 그대로 두고, 그 위에 별도
 * 잔고 이체로 분담 효과를 낸다(임대 구단은 정상적으로 전액 주급을 지출하되,
 * 원 소속 구단으로부터 분담분만큼 보전받는 구조).
 */
/** 임대 주급 분담 재협상 요청 방향(고도화 항목3). */
export type LoanWageRenegotiationDirection = 'increase' | 'decrease';

/** 재협상 1회당 분담률이 오르내리는 폭. */
export const LOAN_WAGE_RENEGOTIATION_STEP = 0.15;
/** 임대 구단이 "선수가 부진하다"며 분담 인상을 요청할 수 있는 시즌 출전 수 상한(이하). */
export const LOAN_WAGE_LOW_APPS_THRESHOLD = 5;
/** 원 소속 구단이 "선수가 잘 크고 있다"며 분담 인하를 요청할 수 있는 시즌 출전 수 하한(이상). */
export const LOAN_WAGE_HIGH_APPS_THRESHOLD = 15;

export interface LoanWageRenegotiationResult { ok: boolean; reason?: string; newShare?: number; }

/**
 * 임대 주급 분담률 재협상(고도화 항목3) — 서명 시 고정됐던 분담률을 시즌 중 한 번
 * 조정 요청할 수 있다. 임대 구단이 분담 인상(increase)을 요청하면 이번 시즌 선수가
 * 충분히 뛰지 못했을 때만(부진해 보이니 원 소속이 동정적으로 더 부담) 받아들여지고,
 * 원 소속 구단이 분담 인하(decrease)를 요청하면 선수가 충분히 많이 뛰었을 때만(잘
 * 크고 있으니 부담을 줄여도 되지 않겠냐는 명분) 받아들여진다. 시즌당 1회 제한.
 */
export function renegotiateLoanWageShare(
  clubs: Club[], playerId: string, direction: LoanWageRenegotiationDirection,
): LoanWageRenegotiationResult {
  const loanClub = clubs.find((c) => c.players.some((p) => p.id === playerId));
  if (!loanClub) return { ok: false, reason: '해당 선수를 찾을 수 없습니다.' };
  const player = loanClub.players.find((p) => p.id === playerId)!;
  if (!player.loanFromClubId) return { ok: false, reason: '임대 중인 선수가 아닙니다.' };
  if (player.loanWageRenegotiatedThisSeason) {
    return { ok: false, reason: '이번 시즌에는 이미 분담률 재협상을 시도했습니다.' };
  }
  player.loanWageRenegotiatedThisSeason = true;
  const currentShare = clamp(player.loanWageShareByParent ?? 0, 0, 1);

  if (direction === 'increase') {
    if (player.seasonApps > LOAN_WAGE_LOW_APPS_THRESHOLD) {
      return { ok: false, reason: '선수가 이미 충분히 출전하고 있어 원 소속 구단이 분담 인상을 거절했습니다.' };
    }
    const newShare = clamp(currentShare + LOAN_WAGE_RENEGOTIATION_STEP, 0, 1);
    player.loanWageShareByParent = newShare;
    return { ok: true, newShare };
  }
  if (player.seasonApps < LOAN_WAGE_HIGH_APPS_THRESHOLD) {
    return { ok: false, reason: '선수가 아직 확실히 자리잡지 못해 임대 구단이 분담 인하를 거절했습니다.' };
  }
  const newShare = clamp(currentShare - LOAN_WAGE_RENEGOTIATION_STEP, 0, 1);
  player.loanWageShareByParent = newShare;
  return { ok: true, newShare };
}

export function applyLoanWageSubsidies(clubs: Club[]): void {
  const byId = new Map(clubs.map((c) => [c.id, c]));
  for (const club of clubs) {
    for (const player of club.players) {
      if (!player.loanFromClubId || !player.loanWageShareByParent) continue;
      const parent = byId.get(player.loanFromClubId);
      if (!parent) continue;
      const subsidy = Math.round(player.wage * player.loanWageShareByParent * 52);
      parent.finance.balance -= subsidy;
      club.finance.balance += subsidy;
    }
  }
}

// ── 스와프 딜 (A2) ────────────────────────────────────────

export interface SwapResult {
  ok: boolean;
  reason?: string;
  playerAName?: string;
  playerBName?: string;
}

/**
 * 두 구단이 선수를 맞교환한다(A2, 신규 개선 항목 8로 리저브/유스 선수까지 확장) —
 * 프리시즌 협상 없이 즉시 실행. 필요하면 격차를 메울 현금(cashAdjustment)을 함께
 * 이체한다: 양수면 clubA→clubB, 음수면 clubB→clubA. 1:1 교환이라 양쪽 1군 인원은
 * 그대로라 MIN/MAX_SQUAD는 걸리지 않지만, 1군 포지션 라인이 바닥나는 교환은
 * sellerLineDepthOk로 막는다(리저브는 뎁스 제약이 없어 자유롭게 오간다). 각 선수는
 * 원래 있던 쪽과 같은 급(1군↔1군, 리저브↔리저브)으로 상대 구단에 합류하므로,
 * 1군 선수를 상대 유스 유망주와 맞바꾸는 크로스티어 딜도 자연히 성립한다.
 */
export function swapPlayers(
  clubs: Club[], clubAId: string, clubBId: string, playerAId: string, playerBId: string, cashAdjustment = 0,
): SwapResult {
  const clubA = clubs.find((c) => c.id === clubAId);
  if (!clubA) return { ok: false, reason: 'A 구단을 찾을 수 없습니다.' };
  const clubB = clubs.find((c) => c.id === clubBId);
  if (!clubB) return { ok: false, reason: 'B 구단을 찾을 수 없습니다.' };
  if (clubA.id === clubB.id) return { ok: false, reason: '같은 구단끼리는 맞교환할 수 없습니다.' };

  const aInFirst = clubA.players.find((p) => p.id === playerAId);
  const aInReserve = (clubA.reserves ?? []).find((p) => p.id === playerAId);
  const playerA = aInFirst ?? aInReserve;
  if (!playerA) return { ok: false, reason: 'A 선수를 찾을 수 없습니다.' };
  const bInFirst = clubB.players.find((p) => p.id === playerBId);
  const bInReserve = (clubB.reserves ?? []).find((p) => p.id === playerBId);
  const playerB = bInFirst ?? bInReserve;
  if (!playerB) return { ok: false, reason: 'B 선수를 찾을 수 없습니다.' };

  if (playerA.loanFromClubId || playerB.loanFromClubId) {
    return { ok: false, reason: '임대 중인 선수는 맞교환할 수 없습니다.' };
  }
  if (aInFirst && !sellerLineDepthOk(clubA, playerA)) {
    return { ok: false, reason: 'A 구단이 해당 포지션 자원을 유지하려 합니다.' };
  }
  if (bInFirst && !sellerLineDepthOk(clubB, playerB)) {
    return { ok: false, reason: 'B 구단이 해당 포지션 자원을 유지하려 합니다.' };
  }
  if (cashAdjustment > 0 && clubA.finance.balance < cashAdjustment) {
    return { ok: false, reason: 'A 구단 자금이 부족합니다.' };
  }
  if (cashAdjustment < 0 && clubB.finance.balance < -cashAdjustment) {
    return { ok: false, reason: 'B 구단 자금이 부족합니다.' };
  }

  if (aInFirst) clubA.players = clubA.players.filter((p) => p.id !== playerAId);
  else clubA.reserves = (clubA.reserves ?? []).filter((p) => p.id !== playerAId);
  if (bInFirst) clubB.players = clubB.players.filter((p) => p.id !== playerBId);
  else clubB.reserves = (clubB.reserves ?? []).filter((p) => p.id !== playerBId);

  // 새 구단으로 이적(로열티 초기화, 신규 개선 항목 10).
  playerA.seasonsAtClub = 0;
  playerB.seasonsAtClub = 0;

  if (bInFirst) { clubA.players.push(playerB); reassignSquadNumber(clubA, playerB); } else {
    clubA.reserves = clubA.reserves ?? [];
    clubA.reserves.push(playerB);
  }
  if (aInFirst) { clubB.players.push(playerA); reassignSquadNumber(clubB, playerA); } else {
    clubB.reserves = clubB.reserves ?? [];
    clubB.reserves.push(playerA);
  }

  if (cashAdjustment !== 0) {
    clubA.finance.balance -= cashAdjustment;
    clubB.finance.balance += cashAdjustment;
  }

  return { ok: true, playerAName: playerA.name, playerBName: playerB.name };
}
