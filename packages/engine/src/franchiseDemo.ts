/**
 * 멀티시즌 데모: 5시즌을 자동 진행하며
 *   - 우승팀 변천
 *   - 유망주 한 명의 성장 곡선
 *   - 스쿼드 평균 연령/은퇴 흐름
 * 을 추적한다.
 * 실행: npm run franchise-demo --workspace @soccer-tycoon/engine
 */
import { Rng } from './rng.js';
import { generateClub } from './generate.js';
import { advanceSeason } from './franchise.js';
import { currentAbility } from './derived.js';
import { marketValue } from './valuation.js';
import { formatMoney } from './money.js';
import type { Club, Player } from './types.js';

const SEED = 2026;
const N = 12;
const SEASONS = 5;
const rng = new Rng(SEED);

const clubs: Club[] = [];
for (let i = 0; i < N; i++) {
  const tier = 8 + Math.round((i / (N - 1)) * 8);
  clubs.push(generateClub(rng, `c${i}`, `Club ${String.fromCharCode(65 + i)}`, tier));
}

// 추적할 유망주: 21세 이하 중 잠재력 갭이 가장 큰 선수
let prospect: Player | undefined;
let bestGap = -Infinity;
for (const c of clubs) {
  for (const p of c.players) {
    if (p.age <= 20) {
      const gap = p.potential - currentAbility(p);
      if (gap > bestGap) { bestGap = gap; prospect = p; }
    }
  }
}

function snapshot(label: string): string {
  if (!prospect) return `  ${label}  (유망주 없음)`;
  return (
    `  ${label}  ${prospect.name} — ${prospect.age}세  ` +
    `CA ${currentAbility(prospect).toFixed(0).padStart(3)} / PA ${prospect.potential.toFixed(0)}  ` +
    `가치 ${formatMoney(marketValue(prospect))}`
  );
}

function avgLeagueAge(): number {
  const all = clubs.flatMap((c) => c.players);
  return all.reduce((sum, p) => sum + p.age, 0) / all.length;
}

console.log('═'.repeat(62));
console.log(`  멀티시즌 프랜차이즈 — ${N}팀, ${SEASONS}시즌`);
console.log('═'.repeat(62));
console.log(`추적 유망주: ${prospect?.name} (시작 ${prospect?.age}세, PA ${prospect?.potential.toFixed(0)})`);
console.log('─'.repeat(62));

// 시즌을 한 칸씩 진행하며 그 사이사이 상태를 기록
const trace: string[] = [snapshot('시작 ')];
const seasonLines: string[] = [];
for (let s = 1; s <= SEASONS; s++) {
  const summary = advanceSeason(clubs, s, SEED + s * 1000);
  seasonLines.push(
    `  시즌 ${s}: 🏆 ${summary.championName.padEnd(9)} ` +
    `| 이적 ${String(summary.transfers.length).padStart(2)}건 ` +
    `| 은퇴 ${String(summary.retirements).padStart(2)}명 ` +
    `| 리그 평균연령 ${avgLeagueAge().toFixed(1)}세`,
  );
  trace.push(snapshot(`S${s} 후`));
}

console.log('우승팀 변천 / 이적·은퇴:');
seasonLines.forEach((l) => console.log(l));

console.log('─'.repeat(62));
console.log('유망주 성장 곡선:');
trace.forEach((t) => console.log(t));
console.log('═'.repeat(62));
