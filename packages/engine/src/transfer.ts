/**
 * 이적 시장 AI 시뮬레이션 (economy.md 5장).
 * 각 구단이 약점 라인을 식별 → 예산 내 매물 탐색 → 제안(거절 시 한 번 재협상) →
 * 수락/거절. 구단당 창마다 최대 AI_MAX_DEALS_PER_CLUB건까지 성사 가능(고도화 항목6).
 */
import type { Club, Line, Player } from './types.js';
import { lineOf } from './teamStrength.js';
import { currentAbility } from './derived.js';
import { marketValue, weeklyWage } from './valuation.js';
import { annualWageBill, wageBudget } from './financeControl.js';
import { MIN_SQUAD } from './transferActions.js';
import { assignSquadNumber } from './generate.js';
import { Rng } from './rng.js';

export interface TransferDeal {
  playerId: string;
  playerName: string;
  position: string;
  fromClubId: string;
  fromClubName: string;
  toClubId: string;
  toClubName: string;
  fee: number;
}

const OUTFIELD_LINES: Line[] = ['DEF', 'MID', 'ATT'];

/** 한 이적 창에서 AI 구단 하나가 성사시킬 수 있는 최대 영입 건수(고도화 항목6) —
 *  기존 "창당 1건" 제한을 완화해 여러 약점 라인을 순차 보강할 수 있게 한다. */
export const AI_MAX_DEALS_PER_CLUB = 2;

function playersInLine(club: Club, line: Line): Player[] {
  return club.players.filter((p) => lineOf(p.position) === line);
}

/** 라인별 평균 CA. 자원이 가장 약한 라인을 약점으로 본다. */
function weakestLine(club: Club): Line {
  let worst: Line = 'MID';
  let worstAvg = Infinity;
  for (const line of OUTFIELD_LINES) {
    const ps = playersInLine(club, line);
    if (ps.length === 0) return line;
    const avg = ps.reduce((s, p) => s + currentAbility(p), 0) / ps.length;
    if (avg < worstAvg) { worstAvg = avg; worst = line; }
  }
  return worst;
}

function bestCAInLine(club: Club, line: Line): number {
  const ps = playersInLine(club, line);
  return ps.length ? Math.max(...ps.map(currentAbility)) : 0;
}

/**
 * 이적 창 실행.
 * @param excludeClubId 지정 시 해당 구단은 AI 매매에서 제외(매수·매도 모두).
 *   사용자가 직접 관리하는 구단을 보호하는 데 쓴다.
 * @returns 성사된 이적 목록. 구단 객체(선수단/재정)는 직접 변경된다.
 */
export function runTransferWindow(
  clubs: Club[], seed: number, excludeClubId?: string,
): TransferDeal[] {
  const rng = new Rng(seed);
  const deals: TransferDeal[] = [];
  // 한 창에서 선수는 최대 1회만 이적 (재판매 방지).
  const moved = new Set<string>();

  // 구단 처리 순서 무작위(시드 고정). 제외 구단은 매수자에서 뺀다.
  const order = clubs.filter((c) => c.id !== excludeClubId);
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }

  for (const buyer of order) {
    // 구단당 여러 건을 성사시킬 수 있다(고도화 항목6) — 첫 영입 후 스쿼드가 바뀌므로
    // 매 회차마다 약점 라인·예산을 다시 계산해, 한 창에서 여러 약점을 순차 보강한다.
    for (let dealCount = 0; dealCount < AI_MAX_DEALS_PER_CLUB; dealCount++) {
      const need = weakestLine(buyer);
      const buyerLevel = bestCAInLine(buyer, need);
      const budget = buyer.finance.transferBudget;

      // 후보 탐색: 타 구단, 필요 라인, 예산 내, 우리 자원보다 확실히 나은 선수
      let best: { seller: Club; player: Player; fee: number } | null = null;
      for (const seller of clubs) {
        if (seller.id === buyer.id) continue;
        if (seller.id === excludeClubId) continue; // 보호 구단은 매도 대상에서 제외
        // 매도 구단은 해당 라인에 최소 인원(3)을 남겨야 판다
        if (playersInLine(seller, need).length <= 3) continue;
        // 이번 창에서 이미 다른 구매자에게 판 만큼 줄어든 전체 스쿼드도 하한 밑으로 못 내려간다.
        if (seller.players.length - 1 < MIN_SQUAD) continue;
        for (const player of playersInLine(seller, need)) {
          if (moved.has(player.id)) continue; // 이미 이번 창에 이적함
          const ca = currentAbility(player);
          if (ca <= buyerLevel + 3) continue; // 의미 있는 보강만
          const value = marketValue(player);
          // 1차 제안은 다소 낮게 부른다(시가의 80~100%).
          let fee = Math.round(value * (0.80 + rng.next() * 0.20));
          if (fee < value * 0.95) {
            // 매도 구단이 거절할 만한 저가 제안이면, 선수 협상처럼 한 번 더 올려
            // 재협상을 시도한다(고도화 항목6 — 다중 라운드 협상).
            fee = Math.round(value * (0.95 + rng.next() * 0.15));
          }
          if (fee > budget) continue;
          if (fee > buyer.finance.balance) continue; // 예산은 있어도 실제 보유 자금이 없으면 불가
          // 매도 구단 수락 조건: 재협상까지 거쳐도 시장가의 95% 미만이면 결렬
          if (fee < value * 0.95) continue;
          // 영입 후 연간 임금 총액이 지속가능한 예산을 넘으면(자멸적 영입) 포기
          const projectedWageBill = annualWageBill(buyer) + weeklyWage(player) * 52;
          if (projectedWageBill > wageBudget(buyer)) continue;
          if (!best || ca > currentAbility(best.player)) {
            best = { seller, player, fee };
          }
        }
      }

      if (!best) break; // 이번 회차에 성사가 없으면 이후 회차도 기대하기 어려우므로 중단

      // 성사: 자금/선수단 이동
      const { seller, player, fee } = best;
      buyer.finance.transferBudget -= fee;
      buyer.finance.balance -= fee;
      seller.finance.balance += fee;
      seller.finance.transferBudget += fee;

      seller.players = seller.players.filter((p) => p.id !== player.id);
      player.contractYears = 4;
      player.wage = weeklyWage(player);
      player.releaseClause = undefined;
      buyer.players.push(player);
      assignSquadNumber(rng, buyer.players, player);
      moved.add(player.id);

      deals.push({
        playerId: player.id,
        playerName: player.name,
        position: player.position,
        fromClubId: seller.id,
        fromClubName: seller.name,
        toClubId: buyer.id,
        toClubName: buyer.name,
        fee,
      });
    }
  }

  return deals;
}
