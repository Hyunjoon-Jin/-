/**
 * 헤드리스 밸런스 리포트 (멀티시즌) — CLI 출력.
 * 측정 로직은 balanceSim.ts에 있고(balance.test.ts와 공유), 여기서는 사람이 읽을
 * 리포트로 포맷만 한다.
 * 실행: npm run balance --workspace @soccer-tycoon/engine
 */
import { runBalanceSimulation, clubAvgCA } from './balanceSim.js';
import { formatMoney } from './money.js';

const SEED = 20260701;
const N = 12;
const SEASONS = 15;

const r = runBalanceSimulation(SEED, N, SEASONS);

const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const range = (a: number[]) => `${Math.min(...a).toFixed(2)}~${Math.max(...a).toFixed(2)}`;

console.log('═'.repeat(60));
console.log(`  밸런스 리포트 — ${N}팀 × ${SEASONS}시즌`);
console.log('═'.repeat(60));
console.log(`경기당 평균 득점:    ${avg(r.goalsPerMatch).toFixed(2)}   (시즌별 ${range(r.goalsPerMatch)}, 목표 2.5~3.0)`);
console.log(`현재전력(CA)↔순위:   ${avg(r.caCorr).toFixed(3)}   (시즌별 ${range(r.caCorr)}, 핵심 지표)`);
console.log(`시작평판↔순위:       ${avg(r.repCorr).toFixed(3)}   (시즌 누적으로 자연 하락)`);
console.log(`우승 구단 다양성:    ${new Set(r.champions).size}/${SEASONS}팀   (${r.champions.map((c) => c.replace('c', '')).join(',')})`);
console.log('─'.repeat(60));
console.log('재정 지속성:');
console.log(`  자금 중앙값 추세:  S1 ${formatMoney(r.medianBalances[0]!)} → S${SEASONS} ${formatMoney(r.medianBalances[SEASONS - 1]!)}`);
console.log(`  적자(음수) 발생:   ${r.negativeSeasons}/${SEASONS} 시즌`);
const finalBal = r.clubs.map((c) => c.finance.balance).sort((a, b) => a - b);
console.log(`  최종 자금 범위:    ${formatMoney(finalBal[0]!)} ~ ${formatMoney(finalBal[N - 1]!)}`);
console.log('─'.repeat(60));
console.log('전력 분포 (최종 시즌, 최고11 CA):');
console.log(`  최고11 CA 범위:    ${r.finalTop11CAs[N - 1]!.toFixed(0)} ~ ${r.finalTop11CAs[0]!.toFixed(0)} (스프레드 ${(r.finalTop11CAs[0]! - r.finalTop11CAs[N - 1]!).toFixed(0)})`);
console.log('스쿼드/연령:');
console.log(`  스쿼드 크기 범위:  ${r.minSquad} ~ ${r.maxSquad} 명   (상한 26)`);
console.log(`  평균 연령 추세:    S1 ${r.avgAges[0]!.toFixed(1)} → S${SEASONS} ${r.avgAges[SEASONS - 1]!.toFixed(1)}세 (${range(r.avgAges)})`);
console.log(`  시즌당 은퇴:       평균 ${avg(r.retirementsPerSeason).toFixed(1)}명`);
console.log('═'.repeat(60));

// 최종 순위 vs 평판 (상위 5, 참고용 — 누적 우승 횟수)
console.log('최종 시즌 상위권 (평판순위 → 실제):');
const wins = new Map<string, number>();
for (const c of r.champions) wins.set(c, (wins.get(c) ?? 0) + 1);
[...r.clubs]
  .sort((a, b) => b.finance.reputation - a.finance.reputation)
  .slice(0, 5)
  .forEach((c) => {
    console.log(`  ${c.name} (평판 ${c.finance.reputation}) — 우승 ${wins.get(c.id) ?? 0}회, CA ${clubAvgCA(c).toFixed(0)}`);
  });
console.log('═'.repeat(60));
