/**
 * 사용자 주도 이적 액션 (economy.md 5장 — 플레이어 직접 영입/판매/방출).
 * AI 이적(transfer.ts)과 분리. 프리시즌에 호출되며 구단 객체를 직접 변경한다.
 */
import type { Club, Line, Player } from './types.js';
import { lineOf } from './teamStrength.js';
import { currentAbility } from './derived.js';
import { marketValue, weeklyWage } from './valuation.js';
import { clamp } from './math.js';

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

export interface BuyResult { ok: boolean; fee?: number; playerName?: string; reason?: string }

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

  return Math.round(marketValue(player) * importance);
}

export type OfferOutcome = 'accepted' | 'countered' | 'rejected';

export interface OfferEvaluation {
  /** 협상 자체가 성립하는지(스쿼드·예산·매물 유효성). */
  ok: boolean;
  reason?: string;
  outcome?: OfferOutcome;
  /** 매도 구단 호가(제안 시 공개). */
  asking?: number;
  /** 역제안 금액(countered일 때). */
  counter?: number;
  playerName?: string;
}

/**
 * 제안액에 대한 매도 구단의 반응(순수 함수 — 구단을 변경하지 않음).
 * 호가 이상이면 수락, 하한 이상이면 역제안, 그 미만이면 거절.
 */
export function evaluateOffer(
  clubs: Club[], myClubId: string, playerId: string, offer: number,
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
  if (!(offer > 0)) return { ok: false, reason: '제안액을 입력하세요.' };
  if (offer > me.finance.transferBudget) return { ok: false, reason: '이적 예산을 초과했습니다.' };
  if (offer > me.finance.balance) return { ok: false, reason: '보유 자금이 부족합니다.' };

  const asking = askingPrice(seller, player);
  const floor = Math.round(asking * 0.82);
  let outcome: OfferOutcome;
  let counter: number | undefined;
  if (offer >= asking) {
    outcome = 'accepted';
  } else if (offer >= floor) {
    outcome = 'countered';
    counter = Math.min(asking, Math.round((asking + offer) / 2));
  } else {
    outcome = 'rejected';
  }
  return { ok: true, outcome, asking, counter, playerName: player.name };
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
  if (!(fee > 0)) return { ok: false, reason: '이적료가 올바르지 않습니다.' };
  // evaluateOffer와 동일한 하한(호가의 82%) — 협상 없이 직접 buyPlayerAt을 호출해도
  // 헐값에 선수를 사들이지 못하도록 매도 구단 쪽에서 다시 검증한다.
  const floor = Math.round(askingPrice(seller, player) * 0.82);
  if (fee < floor) {
    return { ok: false, reason: '제안액이 너무 낮아 거절당했습니다.' };
  }
  if (me.finance.transferBudget < fee) {
    return { ok: false, reason: '이적 예산이 부족합니다.' };
  }
  if (me.finance.balance < fee) {
    return { ok: false, reason: '보유 자금이 부족합니다.' };
  }

  me.finance.transferBudget -= fee;
  me.finance.balance -= fee;
  seller.finance.balance += fee;
  seller.finance.transferBudget += fee;
  seller.players = seller.players.filter((p) => p.id !== playerId);
  player.contractYears = 4;
  player.wage = weeklyWage(player);
  me.players.push(player);
  reassignSquadNumber(me, player);

  return { ok: true, fee, playerName: player.name };
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
  if (!player) return [];
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

/** 특정 구단의 입찰을 수락해 판매 실행(입찰액은 sellOffers와 동일하게 결정론적). */
export function acceptSellOffer(
  clubs: Club[], myClubId: string, playerId: string, buyerId: string,
): SellResult {
  const me = clubs.find((c) => c.id === myClubId);
  if (!me) return { ok: false, reason: '내 구단을 찾을 수 없습니다.' };
  if (me.players.length <= MIN_SQUAD) {
    return { ok: false, reason: `최소 스쿼드 인원(${MIN_SQUAD}명)이라 판매할 수 없습니다.` };
  }
  const player = me.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, reason: '내 스쿼드에 없는 선수입니다.' };

  const offer = sellOffers(clubs, myClubId, playerId).find((o) => o.clubId === buyerId);
  if (!offer) return { ok: false, reason: '해당 구단의 제안이 유효하지 않습니다.' };
  const buyer = clubs.find((c) => c.id === buyerId)!;
  const fee = offer.bid;

  me.players = me.players.filter((p) => p.id !== playerId);
  me.finance.balance += fee;
  me.finance.transferBudget += fee;
  buyer.finance.balance -= fee;
  buyer.finance.transferBudget -= fee;
  player.contractYears = 4;
  player.wage = weeklyWage(player);
  buyer.players.push(player);
  reassignSquadNumber(buyer, player);

  return { ok: true, fee, buyerName: buyer.name, playerName: player.name };
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
  me.players = me.players.filter((p) => p.id !== playerId);
  return { ok: true, playerName: player.name };
}
