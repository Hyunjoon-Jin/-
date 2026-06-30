/**
 * 데모: 두 구단을 생성해 경기 한 건을 시뮬레이션하고 텍스트 중계를 출력.
 * 실행: npm run demo --workspace @soccer-tycoon/engine
 */
import { Rng } from './rng.js';
import { generateClub, defaultTactic } from './generate.js';
import { simulateMatch } from './simulateMatch.js';
import { computeTeamStrength } from './teamStrength.js';
import type { ShotOutcome } from './types.js';

const SEED = 20260630;
const rng = new Rng(SEED);

// 전력차가 있는 두 구단 생성 (tier 14 vs 11)
const home = generateClub(rng, 'home', 'FC 서울리온', 14);
const away = generateClub(rng, 'away', '부산 유나이티드', 11);

const homeTactic = defaultTactic(home);
const awayTactic = defaultTactic(away);

const outcomeLabel: Record<ShotOutcome, string> = {
  GOAL: '⚽ 골!!!',
  SAVE: '🧤 선방',
  OFF_TARGET: '➡️ 빗나감',
  BLOCKED: '🛡️ 블록',
};

function fmt(n: number): string {
  return n.toFixed(1).padStart(5);
}

const hs = computeTeamStrength(home, homeTactic);
const as = computeTeamStrength(away, awayTactic);

console.log('═'.repeat(56));
console.log(`  ${home.name}  vs  ${away.name}`);
console.log('═'.repeat(56));
console.log('팀 강도 지표        홈     원정');
console.log(`  공격          ${fmt(hs.attack)}  ${fmt(as.attack)}`);
console.log(`  창출          ${fmt(hs.creation)}  ${fmt(as.creation)}`);
console.log(`  중원          ${fmt(hs.midfield)}  ${fmt(as.midfield)}`);
console.log(`  수비          ${fmt(hs.defense)}  ${fmt(as.defense)}`);
console.log(`  GK            ${fmt(hs.gk)}  ${fmt(as.gk)}`);
console.log('─'.repeat(56));

const result = simulateMatch({
  home: { club: home, tactic: homeTactic },
  away: { club: away, tactic: awayTactic },
  seed: SEED,
});

// 주요 장면(골 + 선방)만 중계
console.log('주요 장면:');
for (const e of result.events) {
  if (e.outcome === 'GOAL' || e.outcome === 'SAVE') {
    const who = e.side === 'home' ? home.name : away.name;
    console.log(
      `  ${String(e.minute).padStart(2)}'  [${who}] ${e.playerName} — ${outcomeLabel[e.outcome]}`,
    );
  }
}

console.log('─'.repeat(56));
console.log(`최종 스코어:  ${home.name} ${result.score[0]} : ${result.score[1]} ${away.name}`);
console.log(`점유율:       ${result.possession[0]}% : ${result.possession[1]}%`);
console.log(`슈팅:         ${result.shots[0]} : ${result.shots[1]}`);
console.log(`시드:         ${result.seed}  (동일 시드 = 동일 결과)`);
console.log('═'.repeat(56));
