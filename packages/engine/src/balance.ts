/**
 * 헤드리스 밸런스 리포트 (멀티시즌).
 * 프랜차이즈를 여러 시즌 자동 진행하며 게임 건강도 지표를 측정한다:
 *   - 경기당 평균 득점
 *   - 전력(평판)↔최종 순위 상관
 *   - 우승 구단 다양성
 *   - 재정 지속성(자금 추세·음수 발생)
 *   - 스쿼드 크기·평균 연령 안정성 / 은퇴 인원
 * 실행: npm run balance --workspace @soccer-tycoon/engine
 */
import { Rng } from './rng.js';
import { generateClub } from './generate.js';
import { advanceSeason } from './franchise.js';
import { currentAbility } from './derived.js';
import { formatMoney } from './money.js';
import type { Club } from './types.js';

const SEED = 20260701;
const N = 12;
const SEASONS = 15;

const rng = new Rng(SEED);
const clubs: Club[] = [];
for (let i = 0; i < N; i++) {
  const tier = 8 + Math.round((i / (N - 1)) * 8);
  clubs.push(generateClub(rng, `c${i}`, `Club ${String.fromCharCode(65 + i)}`, tier));
}
// 평판은 고정 → 시즌 전 스냅샷으로 순위상관 기준
const repRank = new Map(
  [...clubs].sort((a, b) => b.finance.reputation - a.finance.reputation).map((c, i) => [c.id, i]),
);

/** 최고 11명 평균 CA — 경기에 실제로 반영되는 전력에 가까운 지표. */
function clubAvgCA(c: Club): number {
  const top = c.players.map(currentAbility).sort((a, b) => b - a).slice(0, 11);
  return top.reduce((s, x) => s + x, 0) / top.length;
}

function spearman(rankOf: Map<string, number>, seasonTable: { clubId: string }[]): number {
  let d2 = 0;
  seasonTable.forEach((row, pos) => {
    const d = rankOf.get(row.clubId)! - pos;
    d2 += d * d;
  });
  return 1 - (6 * d2) / (N * (N * N - 1));
}

const goalsPerSeason: number[] = [];
const repCorrPerSeason: number[] = [];
const caCorrPerSeason: number[] = [];
const champions: string[] = [];
const medianBalances: number[] = [];
let negativeSeasons = 0;
let minSquad = Infinity;
let maxSquad = -Infinity;
const avgAges: number[] = [];
const retirementsPerSeason: number[] = [];

for (let s = 1; s <= SEASONS; s++) {
  // 시즌 시작 시점의 현재 전력(CA) 순위 스냅샷
  const caRank = new Map(
    [...clubs].sort((a, b) => clubAvgCA(b) - clubAvgCA(a)).map((c, i) => [c.id, i]),
  );

  const summary = advanceSeason(clubs, s, SEED + s * 1000);

  const totalGoals = summary.table.reduce((sum, r) => sum + r.gf, 0);
  goalsPerSeason.push(totalGoals / (N * (N - 1)));
  repCorrPerSeason.push(spearman(repRank, summary.table));
  caCorrPerSeason.push(spearman(caRank, summary.table));
  champions.push(summary.championId);
  retirementsPerSeason.push(summary.retirements);

  const balances = clubs.map((c) => c.finance.balance).sort((a, b) => a - b);
  medianBalances.push(balances[Math.floor(N / 2)]!);
  if (balances[0]! < 0) negativeSeasons++;

  for (const c of clubs) {
    minSquad = Math.min(minSquad, c.players.length);
    maxSquad = Math.max(maxSquad, c.players.length);
  }
  const allPlayers = clubs.flatMap((c) => c.players);
  avgAges.push(allPlayers.reduce((sum, p) => sum + p.age, 0) / allPlayers.length);
}

const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const range = (a: number[]) => `${Math.min(...a).toFixed(2)}~${Math.max(...a).toFixed(2)}`;

console.log('═'.repeat(60));
console.log(`  밸런스 리포트 — ${N}팀 × ${SEASONS}시즌`);
console.log('═'.repeat(60));
console.log(`경기당 평균 득점:    ${avg(goalsPerSeason).toFixed(2)}   (시즌별 ${range(goalsPerSeason)}, 목표 2.5~3.0)`);
console.log(`현재전력(CA)↔순위:   ${avg(caCorrPerSeason).toFixed(3)}   (시즌별 ${range(caCorrPerSeason)}, 핵심 지표)`);
console.log(`시작평판↔순위:       ${avg(repCorrPerSeason).toFixed(3)}   (시즌 누적으로 자연 하락)`);
console.log(`우승 구단 다양성:    ${new Set(champions).size}/${SEASONS}팀   (${champions.map((c) => c.replace('c', '')).join(',')})`);
console.log('─'.repeat(60));
console.log('재정 지속성:');
console.log(`  자금 중앙값 추세:  S1 ${formatMoney(medianBalances[0]!)} → S${SEASONS} ${formatMoney(medianBalances[SEASONS - 1]!)}`);
console.log(`  적자(음수) 발생:   ${negativeSeasons}/${SEASONS} 시즌`);
const finalBal = clubs.map((c) => c.finance.balance).sort((a, b) => a - b);
console.log(`  최종 자금 범위:    ${formatMoney(finalBal[0]!)} ~ ${formatMoney(finalBal[N - 1]!)}`);
console.log('─'.repeat(60));
console.log('전력 분포 (최종 시즌, 최고11 CA):');
const finalCAs = clubs.map(clubAvgCA).sort((a, b) => b - a);
console.log(`  최고11 CA 범위:    ${finalCAs[N - 1]!.toFixed(0)} ~ ${finalCAs[0]!.toFixed(0)} (스프레드 ${(finalCAs[0]! - finalCAs[N - 1]!).toFixed(0)})`);
console.log('스쿼드/연령:');
console.log(`  스쿼드 크기 범위:  ${minSquad} ~ ${maxSquad} 명   (상한 26)`);
console.log(`  평균 연령 추세:    S1 ${avgAges[0]!.toFixed(1)} → S${SEASONS} ${avgAges[SEASONS - 1]!.toFixed(1)}세 (${range(avgAges)})`);
console.log(`  시즌당 은퇴:       평균 ${avg(retirementsPerSeason).toFixed(1)}명`);
console.log('═'.repeat(60));

// 최종 순위 vs 평판 (상위 5)
console.log('최종 시즌 상위권 (평판순위 → 실제):');
const lastTable = advanceSeasonFinalTable();
function advanceSeasonFinalTable() {
  // 마지막 시즌 표는 위 루프에서 이미 소비됐으므로, 참고용으로 평판 상위 5개 구단의
  // 누적 우승 횟수를 대신 출력
  const wins = new Map<string, number>();
  for (const c of champions) wins.set(c, (wins.get(c) ?? 0) + 1);
  return [...clubs]
    .sort((a, b) => b.finance.reputation - a.finance.reputation)
    .slice(0, 5)
    .map((c) => `  ${c.name} (평판 ${c.finance.reputation}) — 우승 ${wins.get(c.id) ?? 0}회, CA ${clubAvgCA(c).toFixed(0)}`);
}
lastTable.forEach((l) => console.log(l));
console.log('═'.repeat(60));
