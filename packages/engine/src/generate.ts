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
import { weeklyWage } from './valuation.js';
import { currentAbility, isAvailable } from './derived.js';
import { rollTraits } from './traits.js';

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

function genPlayer(rng: Rng, position: Position, tier: number, fixedAge?: number): Player {
  const isGk = position === 'GK';
  const age = fixedAge ?? rng.int(17, 34);
  const attributes = genAttributes(rng, tier, isGk);
  // CA 근사: 전체 평균 × 10 (0~200 척도). 데모용 단순화.
  const mean =
    ALL_ATTRS.reduce((s, k) => s + attributes[k], 0) / ALL_ATTRS.length;
  const ca = mean * 10;
  const potential = clamp(ca + (age < 23 ? rng.int(10, 40) : rng.int(0, 10)), 0, 200);
  const player: Player = {
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
    seasonApps: 0,
    injuryMatches: 0,
    yellowCards: 0,
    suspensionMatches: 0,
    contractYears: rng.int(1, 4),
    wage: 0,
    trainingFocus: 'balanced',
    traits: [],
    // 실력 있는 선수는 시작부터 A매치 경력 보유(결정론적, ca 기반).
    caps: ca >= 155 ? Math.min(90, Math.round((ca - 150) / 3.5)) : 0,
    seasonGoals: 0,
    careerApps: 0,
    careerGoals: 0,
    caHistory: [],
  };
  player.wage = weeklyWage(player);
  player.traits = rollTraits(player, rng);
  return player;
}

/**
 * 한 구단 생성: 선발 11 + 후보 7 = 18명.
 * tier(1~20)로 팀 전력 차등.
 */
export function generateClub(rng: Rng, id: string, name: string, tier: number, division = 0): Club {
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

  // 재정: 평판 ≈ tier, 자금/예산은 평판 기반.
  const reputation = clamp(tier, 1, 20);
  const balance = reputation * 50_000 + rng.int(0, 100_000);   // 만원
  const transferBudget = Math.round(balance * 0.4);
  const staffLevel = () => clamp(tier + rng.int(-3, 2), 1, 20);
  const staff = {
    coaching: staffLevel(), medical: staffLevel(),
    scouting: staffLevel(), youth: staffLevel(),
  };
  return { id, name, players, finance: { balance, transferBudget, reputation }, staff, division };
}

/** 유스 신인 1명 생성 (17~19세). 은퇴 선수 대체·유스 유입에 사용. */
export function generateYouthPlayer(rng: Rng, position: Position, tier: number): Player {
  return genPlayer(rng, position, tier, rng.int(17, 19));
}

const ACADEMY_POSITIONS: Position[] = [
  'GK', 'DC', 'DL', 'DR', 'DM', 'MC', 'MC', 'AML', 'AMR', 'AMC', 'ST', 'ST',
];

/**
 * 유스 아카데미 유망주 배출 (매 시즌).
 * 유스 레벨이 높을수록 배출 인원↑·잠재력↑.
 */
export function generateAcademyIntake(rng: Rng, tier: number, youthLevel: number): Player[] {
  const count = 1 + Math.floor(youthLevel / 8); // 1~7:1명, 8~15:2명, 16~20:3명
  const out: Player[] = [];
  for (let i = 0; i < count; i++) {
    const pos = ACADEMY_POSITIONS[rng.int(0, ACADEMY_POSITIONS.length - 1)]!;
    const p = genPlayer(rng, pos, tier - 2, rng.int(16, 18));
    // 아카데미 수준에 따른 잠재력 보너스(유스 8=중립)
    const bonus = Math.max(0, youthLevel - 8) * 2;
    p.potential = clamp(p.potential + bonus, 0, 200);
    out.push(p);
  }
  return out;
}

/** 슬롯 적합도: 포지션 숙련도 우선, 그다음 능력. 부상·정지는 최후순위. */
function slotScore(p: Player, pos: Position): number {
  const fam = p.position === pos ? 1 : (p.familiarity[pos] ?? 0.2);
  return fam * 1000 + currentAbility(p) - (isAvailable(p) ? 0 : 1_000_000);
}

/**
 * 기본 4-3-3 전술 (AI용). 포지션별 최적 선수로 베스트 XI를 구성한다.
 * (배열 순서가 아니라 능력·숙련도로 선발 → 전력이 결과에 제대로 반영됨.)
 */
export function defaultTactic(club: Club): Tactic {
  const used = new Set<string>();
  const lineup = FORMATION_433.map((position) => {
    const pick = club.players
      .filter((p) => !used.has(p.id))
      .sort((a, b) => slotScore(b, position) - slotScore(a, position))[0]
      ?? club.players[0]!;
    used.add(pick.id);
    return { position, playerId: pick.id };
  });
  return { formation: '4-3-3', lineup, mentality: 0.5, tempo: 0.5, pressing: 0.5 };
}
