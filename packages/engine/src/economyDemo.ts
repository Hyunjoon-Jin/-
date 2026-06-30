/**
 * 경영·이적 데모: 선수 가치 평가 → 이적 창 → 시즌 재정 정산.
 * 실행: npm run economy-demo --workspace @soccer-tycoon/engine
 */
import { Rng } from './rng.js';
import { generateClub } from './generate.js';
import { simulateSeason } from './league.js';
import { runTransferWindow } from './transfer.js';
import { marketValue } from './valuation.js';
import { settleSeason } from './finance.js';
import { currentAbility } from './derived.js';
import { formatMoney } from './money.js';
import type { Club } from './types.js';

const SEED = 77;
const N = 12;
const rng = new Rng(SEED);

const clubs: Club[] = [];
for (let i = 0; i < N; i++) {
  const tier = 8 + Math.round((i / (N - 1)) * 8);
  clubs.push(generateClub(rng, `c${i}`, `Club ${String.fromCharCode(65 + i)}`, tier));
}

console.log('═'.repeat(60));
console.log('  1) 선수 가치 평가 — Club L (강팀) 상위 5명');
console.log('═'.repeat(60));
const top = [...clubs[N - 1]!.players]
  .sort((a, b) => currentAbility(b) - currentAbility(a))
  .slice(0, 5);
for (const p of top) {
  console.log(
    `  ${p.name.padEnd(14)} ${p.position.padStart(3)}  ${p.age}세  ` +
    `CA ${currentAbility(p).toFixed(0).padStart(3)}  잔여 ${p.contractYears}년  ` +
    `가치 ${formatMoney(marketValue(p)).padStart(12)}  주급 ${formatMoney(p.wage)}`,
  );
}

console.log('\n' + '═'.repeat(60));
console.log('  2) 이적 창 — AI 구단들의 약점 보강');
console.log('═'.repeat(60));
const before = new Map(clubs.map((c) => [c.id, c.finance.transferBudget]));
const deals = runTransferWindow(clubs, SEED);
if (deals.length === 0) {
  console.log('  (성사된 이적 없음)');
} else {
  for (const d of deals) {
    console.log(
      `  ${d.playerName} (${d.position}) : ${d.fromClubName} → ${d.toClubName}  ` +
      `이적료 ${formatMoney(d.fee)}`,
    );
  }
}
console.log(`  총 ${deals.length}건 성사`);

console.log('\n' + '═'.repeat(60));
console.log('  3) 시즌 진행 후 재정 정산');
console.log('═'.repeat(60));
const { table } = simulateSeason(clubs, SEED);
console.log('  순위  구단        평판   순수익        정산 후 자금');
table.forEach((row, pos) => {
  const club = clubs.find((c) => c.id === row.clubId)!;
  const rep = club.finance.reputation;
  const report = settleSeason(club, pos, N);
  const sign = report.net >= 0 ? '+' : '';
  console.log(
    `  ${String(pos + 1).padStart(2)}   ${club.name.padEnd(10)} ` +
    `${String(rep).padStart(3)}   ${(sign + formatMoney(report.net)).padStart(13)}  ` +
    `${formatMoney(club.finance.balance).padStart(14)}`,
  );
});
console.log('═'.repeat(60));
