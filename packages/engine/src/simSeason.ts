/**
 * 헤드리스 밸런싱 검증 (engine.md 5장).
 * 리그를 생성해 1시즌을 시뮬하고, 현실성 지표를 출력한다:
 *   - 경기당 평균 득점 (목표 ≈ 2.5~3.0)
 *   - 홈 승률 (홈 어드밴티지 확인)
 *   - 전력(tier) ↔ 승점 상관 (강팀이 상위인가)
 * 실행: npm run sim-season --workspace @soccer-tycoon/engine
 */
import { Rng } from './rng.js';
import { generateClub } from './generate.js';
import { simulateSeason } from './league.js';
import type { Club } from './types.js';

const SEED = 424242;
const N_CLUBS = 16;
const rng = new Rng(SEED);

// tier를 8~16 사이로 분산 → 전력 격차 있는 리그
const clubs: Club[] = [];
const tierOf = new Map<string, number>();
for (let i = 0; i < N_CLUBS; i++) {
  const tier = 8 + Math.round((i / (N_CLUBS - 1)) * 8); // 8..16
  const id = `c${i}`;
  const club = generateClub(rng, id, `Club ${String.fromCharCode(65 + i)}`, tier);
  clubs.push(club);
  tierOf.set(id, tier);
}

const { table, matches } = simulateSeason(clubs, SEED);

// ── 지표 계산 ──
const totalGoals = matches.reduce((s, m) => s + m.score[0] + m.score[1], 0);
const avgGoals = totalGoals / matches.length;
const homeWins = matches.filter((m) => m.score[0] > m.score[1]).length;
const draws = matches.filter((m) => m.score[0] === m.score[1]).length;
const awayWins = matches.length - homeWins - draws;

// 전력↔승점 순위상관 (Spearman 근사: tier 순위 vs 승점 순위)
const byTier = [...clubs].sort((a, b) => tierOf.get(b.id)! - tierOf.get(a.id)!);
const tierRank = new Map(byTier.map((c, i) => [c.id, i]));
const ptsRank = new Map(table.map((r, i) => [r.clubId, i]));
let d2 = 0;
for (const c of clubs) {
  const d = tierRank.get(c.id)! - ptsRank.get(c.id)!;
  d2 += d * d;
}
const nn = clubs.length;
const spearman = 1 - (6 * d2) / (nn * (nn * nn - 1));

const avgShots =
  matches.reduce((s, m) => s + m.shots[0] + m.shots[1], 0) / matches.length;

// ── 출력 ──
console.log('═'.repeat(56));
console.log(`  시즌 시뮬레이션 — ${N_CLUBS}개 구단, ${matches.length}경기`);
console.log('═'.repeat(56));
console.log(`경기당 평균 득점:   ${avgGoals.toFixed(2)}   (목표 2.5~3.0)`);
console.log(`경기당 평균 슈팅:   ${avgShots.toFixed(1)}`);
console.log(
  `홈/무/원정 승률:    ${((homeWins / matches.length) * 100).toFixed(0)}% / ` +
  `${((draws / matches.length) * 100).toFixed(0)}% / ` +
  `${((awayWins / matches.length) * 100).toFixed(0)}%`,
);
console.log(`전력↔승점 상관:     ${spearman.toFixed(3)}   (1.0=완전, 강팀일수록 상위)`);
console.log('─'.repeat(56));
console.log('최종 순위표:');
console.log('  # 구단        승점  경기  승-무-패   득실');
table.forEach((r, i) => {
  const gd = r.gf - r.ga;
  console.log(
    `  ${String(i + 1).padStart(2)} ${r.name.padEnd(10)} ` +
    `${String(r.points).padStart(4)}  ${String(r.played).padStart(4)}  ` +
    `${r.won}-${r.drawn}-${r.lost}`.padEnd(9) +
    `  ${gd >= 0 ? '+' : ''}${gd} (tier ${tierOf.get(r.clubId)})`,
  );
});
console.log('═'.repeat(56));
