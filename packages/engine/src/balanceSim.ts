/**
 * 헤드리스 밸런스 시뮬레이션 (멀티시즌).
 * 프랜차이즈를 여러 시즌 자동 진행하며 게임 건강도 지표를 측정한다.
 * balance.ts(CLI 리포트)와 balance.test.ts(자동 회귀 검증)가 이 모듈을 공유해
 * "무엇을 측정하는가"가 한 곳에만 정의되도록 한다.
 */
import { Rng } from './rng.js';
import { generateClub } from './generate.js';
import { advanceSeason } from './franchise.js';
import { currentAbility } from './derived.js';
import type { Club } from './types.js';

export interface BalanceReport {
  teams: number;
  seasons: number;
  /** 시즌별 경기당 평균 득점. */
  goalsPerMatch: number[];
  /** 시즌별 현재전력(CA)↔최종순위 스피어만 상관(핵심 지표). */
  caCorr: number[];
  /** 시즌별 시작평판↔최종순위 스피어만 상관. */
  repCorr: number[];
  /** 시즌별 우승 구단 id. */
  champions: string[];
  /** 시즌별 자금 중앙값. */
  medianBalances: number[];
  /** 최하위 구단 자금이 음수였던 시즌 수. */
  negativeSeasons: number;
  minSquad: number;
  maxSquad: number;
  /** 시즌별(시즌 종료 시점) 전체 선수 평균 연령. */
  avgAges: number[];
  /** 시즌별 은퇴 인원. */
  retirementsPerSeason: number[];
  /** 마지막 시즌 종료 시점 구단별 최고11 평균 CA(내림차순). */
  finalTop11CAs: number[];
  clubs: Club[];
}

/** 최고 11명 평균 CA — 경기에 실제로 반영되는 전력에 가까운 지표. */
export function clubAvgCA(c: Club): number {
  const top = c.players.map(currentAbility).sort((a, b) => b - a).slice(0, 11);
  return top.reduce((s, x) => s + x, 0) / top.length;
}

function spearman(rankOf: Map<string, number>, seasonTable: { clubId: string }[], n: number): number {
  let d2 = 0;
  seasonTable.forEach((row, pos) => {
    const d = rankOf.get(row.clubId)! - pos;
    d2 += d * d;
  });
  return 1 - (6 * d2) / (n * (n * n - 1));
}

/** N팀 × SEASONS시즌 프랜차이즈를 시드 고정으로 자동 진행하고 건강도 지표를 모은다. */
export function runBalanceSimulation(seed: number, n: number, seasons: number): BalanceReport {
  const rng = new Rng(seed);
  const clubs: Club[] = [];
  for (let i = 0; i < n; i++) {
    const tier = 8 + Math.round((i / (n - 1)) * 8);
    clubs.push(generateClub(rng, `c${i}`, `Club ${String.fromCharCode(65 + i)}`, tier));
  }
  // 평판은 고정 → 시즌 전 스냅샷으로 순위상관 기준
  const repRank = new Map(
    [...clubs].sort((a, b) => b.finance.reputation - a.finance.reputation).map((c, i) => [c.id, i]),
  );

  const goalsPerMatch: number[] = [];
  const caCorr: number[] = [];
  const repCorr: number[] = [];
  const champions: string[] = [];
  const medianBalances: number[] = [];
  let negativeSeasons = 0;
  let minSquad = Infinity;
  let maxSquad = -Infinity;
  const avgAges: number[] = [];
  const retirementsPerSeason: number[] = [];

  for (let s = 1; s <= seasons; s++) {
    // 시즌 시작 시점의 현재 전력(CA) 순위 스냅샷
    const caRank = new Map(
      [...clubs].sort((a, b) => clubAvgCA(b) - clubAvgCA(a)).map((c, i) => [c.id, i]),
    );

    const summary = advanceSeason(clubs, s, seed + s * 1000);

    const totalGoals = summary.table.reduce((sum, r) => sum + r.gf, 0);
    goalsPerMatch.push(totalGoals / (n * (n - 1)));
    repCorr.push(spearman(repRank, summary.table, n));
    caCorr.push(spearman(caRank, summary.table, n));
    champions.push(summary.championId);
    retirementsPerSeason.push(summary.retirements);

    const balances = clubs.map((c) => c.finance.balance).sort((a, b) => a - b);
    medianBalances.push(balances[Math.floor(n / 2)]!);
    if (balances[0]! < 0) negativeSeasons++;

    for (const c of clubs) {
      minSquad = Math.min(minSquad, c.players.length);
      maxSquad = Math.max(maxSquad, c.players.length);
    }
    const allPlayers = clubs.flatMap((c) => c.players);
    avgAges.push(allPlayers.reduce((sum, p) => sum + p.age, 0) / allPlayers.length);
  }

  const finalTop11CAs = clubs.map(clubAvgCA).sort((a, b) => b - a);

  return {
    teams: n, seasons, goalsPerMatch, caCorr, repCorr, champions, medianBalances,
    negativeSeasons, minSquad, maxSquad, avgAges, retirementsPerSeason, finalTop11CAs, clubs,
  };
}
