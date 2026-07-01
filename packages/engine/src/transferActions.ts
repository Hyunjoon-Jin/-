/**
 * 사용자 주도 이적 액션 (economy.md 5장 — 플레이어 직접 영입/판매/방출).
 * AI 이적(transfer.ts)과 분리. 프리시즌에 호출되며 구단 객체를 직접 변경한다.
 */
import type { Club, Player } from './types.js';
import { lineOf } from './teamStrength.js';
import { currentAbility } from './derived.js';
import { marketValue, weeklyWage } from './valuation.js';

/** 스쿼드 크기 제약. */
export const MIN_SQUAD = 14;
export const MAX_SQUAD = 30;
/** 강제 판매 시 시장가 대비 회수율(즉시 매각 할인). */
const SELL_RATIO = 0.92;

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
 * 시장가에 선수 중요도(포지션 내 서열)와 잔여 계약을 반영한다.
 * 핵심 선수는 프리미엄, 계약 만료 임박·스쿼드 잉여는 할인.
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

  const years = player.contractYears;
  const contractMul = years <= 1 ? 0.75 : years === 2 ? 0.9 : 1.0;

  return Math.round(marketValue(player) * importance * contractMul);
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
  if (!(offer > 0)) return { ok: false, reason: '제안액을 입력하세요.' };
  if (offer > me.finance.transferBudget) return { ok: false, reason: '이적 예산을 초과했습니다.' };

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
  if (!(fee > 0)) return { ok: false, reason: '이적료가 올바르지 않습니다.' };
  if (me.finance.transferBudget < fee) {
    return { ok: false, reason: '이적 예산이 부족합니다.' };
  }

  me.finance.transferBudget -= fee;
  me.finance.balance -= fee;
  seller.finance.balance += fee;
  seller.finance.transferBudget += fee;
  seller.players = seller.players.filter((p) => p.id !== playerId);
  player.contractYears = 4;
  player.wage = weeklyWage(player);
  me.players.push(player);

  return { ok: true, fee, playerName: player.name };
}

/** 타 구단 선수 영입 (시장가로 즉시 — AI/구버전 경로). */
export function buyPlayer(clubs: Club[], myClubId: string, playerId: string): BuyResult {
  const seller = clubs.find((c) => c.id !== myClubId && c.players.some((p) => p.id === playerId));
  if (!seller) return { ok: false, reason: '해당 선수를 찾을 수 없습니다.' };
  const player = seller.players.find((p) => p.id === playerId)!;
  return buyPlayerAt(clubs, myClubId, playerId, marketValue(player));
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
    .sort((a, b) => lineAvg(a, line) - lineAvg(b, line) || b.finance.transferBudget - a.finance.transferBudget);
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

function lineAvg(club: Club, line: ReturnType<typeof lineOf>): number {
  const ps = club.players.filter((p) => lineOf(p.position) === line);
  if (ps.length === 0) return 0;
  return ps.reduce((s, p) => s + currentAbility(p), 0) / ps.length;
}
