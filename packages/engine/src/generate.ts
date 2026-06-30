/**
 * 가상 데이터 절차적 생성 (design.md: 가상 데이터 / engine.md 1장).
 * 시드 고정 시 동일한 리그가 재현된다.
 * MVP 데이터 생성기의 축소판 — 추후 packages/data 로 확장.
 */
import type {
  AttrKey, Attributes, Club, Player, Position, Tactic,
} from './types.js';
import { ALL_ATTRS, GOALKEEPING_ATTRS } from './types.js';
import { Rng } from './rng.js';
import { clamp } from './math.js';

const FIRST = [
  'Min', 'Jun', 'Leo', 'Marco', 'Diego', 'Yuki', 'Omar', 'Kai', 'Luka', 'Tom',
  'Ravi', 'Sven', 'Pablo', 'Noah', 'Eric', 'Hugo', 'Ali', 'Sora', 'Ivan', 'Cole',
];
const LAST = [
  'Kim', 'Park', 'Silva', 'Rossi', 'Sato', 'Khan', 'Muller', 'Novak', 'Costa', 'Lee',
  'Adams', 'Berg', 'Diaz', 'Okafor', 'Petrov', 'Tan', 'Vidal', 'Yamamoto', 'Cruz', 'Ono',
];
const NATIONS = ['KOR', 'JPN', 'BRA', 'ITA', 'GER', 'ESP', 'FRA', 'ENG', 'NED', 'ARG'];

/** 4-3-3 기본 포메이션 슬롯. */
export const FORMATION_433: Position[] = [
  'GK', 'DL', 'DC', 'DC', 'DR', 'MC', 'MC', 'MC', 'AML', 'ST', 'AMR',
];

function genName(rng: Rng): string {
  return `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
}

/**
 * 능력치 생성: 팀 평균치 tier(1~20)를 중심으로 정규분포.
 * GK 포지션은 골키핑 능력을, 필드 선수는 그 외를 더 높게.
 */
function genAttributes(rng: Rng, tier: number, isGk: boolean): Attributes {
  const attrs = {} as Attributes;
  const gkSet = new Set<AttrKey>(GOALKEEPING_ATTRS);
  for (const key of ALL_ATTRS) {
    const isGkAttr = gkSet.has(key);
    // 포지션 적합 능력은 tier 중심, 비적합 능력은 낮게.
    const relevant = isGk ? isGkAttr : !isGkAttr;
    const center = relevant ? tier : tier - 5;
    const val = Math.round(center + rng.gaussian() * 2.2);
    attrs[key] = clamp(val, 1, 20);
  }
  return attrs;
}

function genPlayer(rng: Rng, position: Position, tier: number): Player {
  const isGk = position === 'GK';
  const age = rng.int(17, 34);
  const attributes = genAttributes(rng, tier, isGk);
  // CA 근사: 전체 평균 × 10 (0~200 척도). 데모용 단순화.
  const mean =
    ALL_ATTRS.reduce((s, k) => s + attributes[k], 0) / ALL_ATTRS.length;
  const ca = mean * 10;
  const potential = clamp(ca + (age < 23 ? rng.int(10, 40) : rng.int(0, 10)), 0, 200);
  return {
    id: `p_${rng.int(100000, 999999)}_${position}`,
    name: genName(rng),
    nationality: rng.pick(NATIONS),
    age,
    position,
    familiarity: { [position]: 1.0 },
    attributes,
    potential,
    condition: 1.0,
    morale: 0.5,
  };
}

/**
 * 한 구단 생성: 선발 11 + 후보 7 = 18명.
 * tier(1~20)로 팀 전력 차등.
 */
export function generateClub(rng: Rng, id: string, name: string, tier: number): Club {
  const players: Player[] = [];
  // 선발 골격
  for (const pos of FORMATION_433) {
    players.push(genPlayer(rng, pos, tier));
  }
  // 후보 (포지션 다양화)
  const benchPos: Position[] = ['GK', 'DC', 'WBR', 'DM', 'MC', 'AMC', 'ST'];
  for (const pos of benchPos) {
    players.push(genPlayer(rng, pos, tier - 1));
  }
  return { id, name, players };
}

/** 생성된 구단의 선발 11명으로 기본 4-3-3 전술 구성. */
export function defaultTactic(club: Club): Tactic {
  const lineup = FORMATION_433.map((position, i) => ({
    position,
    playerId: club.players[i]!.id,
  }));
  return { formation: '4-3-3', lineup, mentality: 0.5, tempo: 0.5, pressing: 0.5 };
}
