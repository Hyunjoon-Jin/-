/**
 * 선수 고유 특성(개성) — 경기·성장·부상·사기에 영향.
 * 각 선수는 능력치와 상관된 확률로 0~2개의 특성을 가진다(생성 시 부여).
 * 효과는 파생 전력(derived) · 경기 효과(matchEffects) · 카드(simulateMatch)
 * · 성장(progression) · 오프시즌 사기(franchise) 곳곳에 얇게 반영된다.
 */
import type { Player, PlayerTrait } from './types.js';
import type { Rng } from './rng.js';

export const ALL_TRAITS: PlayerTrait[] = [
  'leader', 'injuryProne', 'ironMan', 'wonderkid',
  'poacher', 'playmaker', 'hothead', 'rock', 'multiRole',
  'bigGameHero', 'bigGameChoker', 'setPieceSpecialist',
];

export const TRAIT_LABELS: Record<PlayerTrait, string> = {
  leader: '리더',
  injuryProne: '유리몸',
  ironMan: '철강왕',
  wonderkid: '특급 유망주',
  poacher: '골잡이',
  playmaker: '플레이메이커',
  hothead: '다혈질',
  rock: '수비 바위',
  multiRole: '멀티롤 유망주',
  bigGameHero: '빅게임 히어로',
  bigGameChoker: '새가슴',
  setPieceSpecialist: '세트피스 스페셜리스트',
};

export const TRAIT_DESC: Record<PlayerTrait, string> = {
  leader: '스쿼드 전체 사기를 끌어올린다.',
  injuryProne: '부상 확률이 높다.',
  ironMan: '부상에 강하고 체력 소모가 적다.',
  wonderkid: '성장 속도가 매우 빠르다.',
  poacher: '문전 결정력(공격 전력)이 높다.',
  playmaker: '경기를 조율하는 창출 전력이 높다.',
  hothead: '카드를 자주 받는다.',
  rock: '수비 전력이 단단하다.',
  multiRole: '새 포지션 숙련도가 더 빠르게 오른다.',
  bigGameHero: '라이벌전·컵 결승 등 큰 경기에서 기량이 오른다.',
  bigGameChoker: '큰 경기에서 오히려 기량이 떨어진다.',
  setPieceSpecialist: '세트피스 결정력이 높고, 전담자로 지정되면 더 자주 직접 마무리한다.',
};

/** 특성 보유 여부. 구세이브·테스트(traits 미설정)에도 안전. */
export function hasTrait(player: Player, trait: PlayerTrait): boolean {
  return (player.traits ?? []).includes(trait);
}

const ATT_POS = new Set(['ST', 'AMC', 'AML', 'AMR']);
const DEF_POS = new Set(['DC', 'DL', 'DR', 'WBL', 'WBR', 'DM']);

/**
 * 능력치·나이·포지션에 상관된 특성 부여(최대 2개).
 * genPlayer 말미에서 호출. 서로 모순되는 특성(철강왕↔유리몸)은 배제.
 */
export function rollTraits(player: Player, rng: Rng): PlayerTrait[] {
  const a = player.attributes;
  const out: PlayerTrait[] = [];
  const add = (t: PlayerTrait, p: number) => { if (rng.roll(p)) out.push(t); };

  if (player.age <= 20) add('wonderkid', player.potential >= 150 ? 0.18 : 0.05);
  if (player.age <= 21) add('multiRole', a.decisions >= 14 ? 0.15 : 0.04);
  if (ATT_POS.has(player.position)) add('poacher', a.finishing >= 14 ? 0.28 : 0.05);
  add('playmaker', a.vision >= 15 && a.passing >= 14 ? 0.25 : 0.03);
  if (DEF_POS.has(player.position)) add('rock', a.tackling >= 14 || a.marking >= 14 ? 0.22 : 0.04);
  add('leader', a.leadership >= 15 ? 0.30 : a.leadership >= 12 ? 0.08 : 0.02);
  add('hothead', a.aggression >= 15 ? 0.22 : 0.05);
  add('ironMan', a.naturalFitness >= 15 && a.stamina >= 15 ? 0.15 : 0.03);
  add('injuryProne', a.naturalFitness <= 8 ? 0.15 : 0.04);
  add('bigGameHero', a.composure >= 15 && a.bravery >= 13 ? 0.20 : 0.05);
  add('bigGameChoker', a.composure <= 8 ? 0.15 : 0.04);
  add('setPieceSpecialist', a.setPiece >= 15 ? 0.22 : 0.05);

  // 모순 제거: 철강왕↔유리몸, 빅게임 히어로↔새가슴은 양립 불가.
  let resolved = out.includes('ironMan') ? out.filter((t) => t !== 'injuryProne') : out;
  resolved = resolved.includes('bigGameHero') ? resolved.filter((t) => t !== 'bigGameChoker') : resolved;
  // 최대 2개 (부여 우선순위 순서 유지).
  return resolved.slice(0, 2);
}
