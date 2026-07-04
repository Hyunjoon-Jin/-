/**
 * 가상 데이터 절차적 생성 (design.md: 가상 데이터 / engine.md 1장).
 * 시드 고정 시 동일한 리그가 재현된다.
 * MVP 데이터 생성기의 축소판 — 추후 packages/data 로 확장.
 */
import type {
  AttrKey, Attributes, BoardPersona, Club, Player, Position, Tactic,
} from './types.js';
import { ALL_ATTRS, GOALKEEPING_ATTRS } from './types.js';
import { Rng } from './rng.js';
import { clamp } from './math.js';
import { weeklyWage, marketValue } from './valuation.js';
import { currentAbility, isAvailable } from './derived.js';
import { rollTraits, hasTrait } from './traits.js';
import { FORMATIONS } from './formations.js';
import { lineOf } from './teamStrength.js';
import { FIRST, LAST } from './names.js';
import { academyNationPool } from './scouting.js';
import { hireInitialStaffMembers } from './staffActions.js';

const NATIONS = ['KOR', 'JPN', 'BRA', 'ITA', 'GER', 'ESP', 'FRA', 'ENG', 'NED', 'ARG'];

/** 4-3-3 기본 포메이션 슬롯(하위 호환용 별칭 — 실제 정의는 formations.ts). */
export const FORMATION_433: Position[] = FORMATIONS['4-3-3']!;

function genName(rng: Rng): string {
  return `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
}

/** 나이별 잠재력 보너스 범위 — 22→23세 경계에서 근거 없이 뚝 떨어지지 않도록
 *  나이에 따라 매끈하게 보간(17세 근방이 가장 높고, 30대에 가까울수록 낮아짐). */
export function potentialBonusRange(age: number): [number, number] {
  const hi = Math.round(clamp(40 - (age - 17) * 2.2, 5, 40));
  const lo = Math.round(clamp(20 - (age - 17) * 1.2, 0, 20));
  return [Math.min(lo, hi), hi];
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
  const [bonusLo, bonusHi] = potentialBonusRange(age);
  const potential = clamp(ca + rng.int(bonusLo, bonusHi), 0, 200);
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
    // ca는 최대 200이라 (ca-150)*1.8이 상한(90)에 실제로 도달할 수 있는 계수.
    caps: ca >= 155 ? Math.min(90, Math.round((ca - 150) * 1.8)) : 0,
    seasonGoals: 0,
    careerApps: 0,
    careerGoals: 0,
    caHistory: [],
  };
  player.wage = weeklyWage(player);
  player.traits = rollTraits(player, rng);
  player.releaseClause = rollReleaseClause(rng, player);
  return player;
}

/** 방출조항 부여 상한 연령 — 어린 유망주 위주로만 설정(베테랑은 클럽이 조항을 걸지 않음). */
const RELEASE_CLAUSE_MAX_AGE = 24;
/** 방출조항 부여 확률. */
const RELEASE_CLAUSE_CHANCE = 0.18;

/**
 * 방출(바이아웃) 조항 금액 결정 — 어린 선수 일부에게만 시장가의 1.4~2.0배 수준으로 부여.
 * 협상 없이 이 금액을 내면 즉시 영입 가능하므로 시장가보다 프리미엄을 둔다.
 */
function rollReleaseClause(rng: Rng, player: Player): number | undefined {
  if (player.age > RELEASE_CLAUSE_MAX_AGE) return undefined;
  if (!rng.roll(RELEASE_CLAUSE_CHANCE)) return undefined;
  const multiplier = 1.4 + rng.int(0, 6) / 10;
  return Math.round(marketValue(player) * multiplier);
}

/** 구단 내에서 아직 쓰이지 않는 등번호(1~99) 중 하나를 무작위로 배정. */
export function assignSquadNumber(rng: Rng, existingPlayers: Player[], player: Player): void {
  const used = new Set(
    existingPlayers.map((p) => p.squadNumber).filter((n): n is number => n !== undefined),
  );
  const free: number[] = [];
  for (let n = 1; n <= 99; n++) if (!used.has(n)) free.push(n);
  player.squadNumber = free.length > 0 ? free[rng.int(0, free.length - 1)] : undefined;
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
  for (const p of players) assignSquadNumber(rng, players, p);

  // 재정: 평판 ≈ tier, 자금/예산은 평판 기반.
  const reputation = clamp(tier, 1, 20);
  const balance = reputation * 50_000 + rng.int(0, 100_000);   // 만원
  const transferBudget = Math.round(balance * 0.4);
  const staffLevel = () => clamp(tier + rng.int(-3, 2), 1, 20);
  const staff: Club['staff'] = {
    coaching: staffLevel(), medical: staffLevel(),
    scouting: staffLevel(), youth: staffLevel(),
    coachGk: staffLevel(), coachAttack: staffLevel(),
    coachDefense: staffLevel(), coachPhysical: staffLevel(),
  };
  staff.members = hireInitialStaffMembers(id, staff);

  const boardPersona: BoardPersona = {
    patience: rng.pick(['patient', 'impatient']),
    style: rng.pick(['conservative', 'aggressive']),
  };
  return { id, name, players, finance: { balance, transferBudget, reputation }, staff, division, boardPersona };
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
 * 유스 레벨이 높을수록 배출 인원↑·잠재력↑. scoutingLevel이 높을수록 해외 스카우팅
 * 네트워크가 넓어져 더 다양한 국적의 유망주가 나온다(academyNationPool).
 */
export function generateAcademyIntake(
  rng: Rng, tier: number, youthLevel: number, scoutingLevel = 20,
): Player[] {
  const count = 1 + Math.floor(youthLevel / 8); // 1~7:1명, 8~15:2명, 16~20:3명
  const nationPool = academyNationPool(scoutingLevel);
  const out: Player[] = [];
  for (let i = 0; i < count; i++) {
    const pos = ACADEMY_POSITIONS[rng.int(0, ACADEMY_POSITIONS.length - 1)]!;
    const p = genPlayer(rng, pos, tier - 2, rng.int(16, 18));
    // 아카데미 수준에 따른 잠재력 보너스(유스 8=중립)
    const bonus = Math.max(0, youthLevel - 8) * 2;
    p.potential = clamp(p.potential + bonus, 0, 200);
    p.nationality = rng.pick(nationPool);
    out.push(p);
  }
  return out;
}

/** 슬롯 적합도: 포지션 숙련도 우선, 그다음 능력. 부상·정지는 최후순위. */
function slotScore(p: Player, pos: Position): number {
  const fam = p.position === pos ? 1 : (p.familiarity[pos] ?? 0.2);
  return fam * 1000 + currentAbility(p) - (isAvailable(p) ? 0 : 1_000_000);
}

/** AI 전술 결정에 참고할 경기 맥락. 전부 선택적이며, 없으면 중립값으로 동작한다
 *  (기존 defaultTactic(club) 호출부와 하위 호환). */
export interface TacticContext {
  /** 상대 구단 — 전력 격차에 따라 공격적/수비적으로 기운다. */
  opponent?: Club;
  /** 원정이면 소폭 더 수비적인 기본값을 쓴다. */
  isHome?: boolean;
  /** 라이벌전·컵 결승 등 — 변동폭을 줄여 신중하게 임한다. */
  isBigMatch?: boolean;
  /** 최근 5경기 승점(0~15). 연패 중(낮음)이면 더 과감하게, 연승 중(높음)이면 소폭 신중해진다. */
  recentFormPoints?: number;
}

/** 스쿼드 전력 근사치(가용 선수 평균 CA). 전원 결장이면 전체 평균으로 폴백. */
function estimateSquadCA(club: Club): number {
  const avail = club.players.filter(isAvailable);
  const pool = avail.length > 0 ? avail : club.players;
  if (pool.length === 0) return 0;
  return pool.reduce((s, p) => s + currentAbility(p), 0) / pool.length;
}

/** 특정 라인(GK/DEF/MID/ATT)에 속한 주 포지션 선수들의 평균 CA. */
function lineCA(club: Club, line: ReturnType<typeof lineOf>): number {
  const players = club.players.filter((p) => isAvailable(p) && lineOf(p.position) === line);
  if (players.length === 0) return 0;
  return players.reduce((s, p) => s + currentAbility(p), 0) / players.length;
}

/**
 * 스쿼드 강점에 따라 포메이션을 고른다 — 예전엔 AI 전 구단이 예외 없이 4-3-3만
 * 썼다. 공격진이 확실히 강하면 투톱(3-5-2)으로 화력을 늘리고, 수비가 확실히
 * 강하면 안정적인 4-2-3-1로, 중원이 유독 강하면 4-4-2로 지배력을 살린다.
 */
function pickFormation(club: Club): string {
  const att = lineCA(club, 'ATT');
  const def = lineCA(club, 'DEF');
  const mid = lineCA(club, 'MID');
  if (att - def > 6) return '3-5-2';
  if (def - att > 6) return '4-2-3-1';
  if (mid - Math.max(att, def) > 4) return '4-4-2';
  return '4-3-3';
}

/** 포메이션별 기본 폭(width) — 윙백·와이드 미드필더가 있으면 넓게, 더블 피벗 위주면 좁게. */
const FORMATION_WIDTH: Record<string, number> = {
  '4-3-3': 0.6, '4-4-2': 0.65, '4-2-3-1': 0.45, '3-5-2': 0.7,
};
/** 포메이션별 기본 수비라인 높이 — 더블 피벗(4-2-3-1)은 안정성 위주로 낮게 시작. */
const FORMATION_LINE: Record<string, number> = {
  '4-3-3': 0.55, '4-4-2': 0.5, '4-2-3-1': 0.4, '3-5-2': 0.5,
};

/**
 * AI 공격성향(mentality) 결정 — 예전엔 항상 0.5 고정이었다.
 * 상대 대비 전력 격차(강하면 더 공격적, 약하면 더 수비적), 원정 보정(소폭 수비적),
 * 최근 폼(연패 중이면 과감하게, 연승 중이면 소폭 신중하게), 빅매치 보정(변동폭을
 * 절반으로 눌러 신중하게)을 반영한다.
 */
function computeAiMentality(club: Club, ctx: TacticContext): number {
  let mentality = 0.5;
  if (ctx.opponent) {
    const gap = clamp((estimateSquadCA(club) - estimateSquadCA(ctx.opponent)) / 40, -1, 1);
    mentality += gap * 0.15;
  }
  if (ctx.isHome === false) mentality -= 0.05;
  if (ctx.recentFormPoints !== undefined) {
    // 최근 5경기 기준 중립(7.5점)보다 승점이 낮을수록(연패) 더 과감해지고,
    // 높을수록(연승) 좋은 흐름을 지키려 소폭 신중해진다.
    const formBias = clamp((7.5 - ctx.recentFormPoints) / 15, -0.3, 0.3);
    mentality += formBias * 0.15;
  }
  if (ctx.isBigMatch) mentality = 0.5 + (mentality - 0.5) * 0.5;
  return clamp(mentality, 0.15, 0.85);
}

/** AI 압박강도(pressing) 결정 — 빅매치에서는 무리한 압박으로 체력을 낭비하지 않도록 소폭 낮춘다. */
function computeAiPressing(ctx: TacticContext): number {
  let pressing = 0.5;
  if (ctx.isBigMatch) pressing -= 0.05;
  return clamp(pressing, 0.2, 0.8);
}

/** AI 폭(width) 결정 — 포메이션 기본값에 공격성향을 소폭 더한다(공격적일수록 측면도 더 활용). */
function computeAiWidth(formation: string, mentality: number): number {
  const base = FORMATION_WIDTH[formation] ?? 0.55;
  return clamp(base + (mentality - 0.5) * 0.2, 0.15, 0.85);
}

/**
 * AI 수비라인 높이 결정 — 포메이션 기본값에 공격성향을 더해(공격적인 팀은 라인도
 * 함께 올려 일관된 스타일을 만든다), 빅매치에서는 신중하게 소폭 낮춘다.
 */
function computeAiDefensiveLine(formation: string, mentality: number, ctx: TacticContext): number {
  const base = FORMATION_LINE[formation] ?? 0.5;
  let line = base + (mentality - 0.5) * 0.3;
  if (ctx.isBigMatch) line -= 0.05;
  return clamp(line, 0.15, 0.85);
}

/** 세트피스 전담자 선정 점수 — 세트피스 스페셜리스트 특성이 있으면 소폭 가산. */
function setPieceTakerScore(p: Player): number {
  return p.attributes.setPiece + (hasTrait(p, 'setPieceSpecialist') ? 3 : 0);
}

/** 라인업(ATT·MID) 중 세트피스 능력치(특성 가산 포함)가 가장 높은 선수를 전담자로 자동 지정. */
function pickSetPieceTaker(club: Club, lineup: { position: Position; playerId: string }[]): string | undefined {
  const byId = new Map(club.players.map((p) => [p.id, p]));
  const eligible = lineup
    .filter((s) => lineOf(s.position) === 'ATT' || lineOf(s.position) === 'MID')
    .map((s) => byId.get(s.playerId))
    .filter((p): p is Player => p !== undefined);
  if (eligible.length === 0) return undefined;
  return eligible.sort((a, b) => setPieceTakerScore(b) - setPieceTakerScore(a))[0]!.id;
}

/** 라인업 중 리더 특성 보유자를 우선하고, 없으면 리더십 능력치가 가장 높은 선수를 주장으로 자동 지정. */
function pickCaptain(club: Club, lineup: { position: Position; playerId: string }[]): string | undefined {
  const byId = new Map(club.players.map((p) => [p.id, p]));
  const inLineup = lineup
    .map((s) => byId.get(s.playerId))
    .filter((p): p is Player => p !== undefined);
  if (inLineup.length === 0) return undefined;
  const leaders = inLineup.filter((p) => hasTrait(p, 'leader'));
  const pool = leaders.length > 0 ? leaders : inLineup;
  return [...pool].sort((a, b) => b.attributes.leadership - a.attributes.leadership)[0]!.id;
}

/**
 * 기본 전술(AI용). 포지션별 최적 선수로 베스트 XI를 구성하고, 스쿼드 강점에 맞는
 * 포메이션과 경기 맥락(상대 전력·홈/원정·빅매치 여부)에 반응하는 공격성향·압박강도를 정한다.
 * (배열 순서가 아니라 능력·숙련도로 선발 → 전력이 결과에 제대로 반영됨.)
 */
export function defaultTactic(club: Club, ctx: TacticContext = {}): Tactic {
  const formation = pickFormation(club);
  const positions = FORMATIONS[formation] ?? FORMATIONS['4-3-3']!;
  const used = new Set<string>();
  const lineup = positions.map((position) => {
    const pool = club.players.filter((p) => !used.has(p.id));
    if (pool.length === 0) {
      // 미사용 선수가 없으면 club.players[0]로 조용히 폴백하던 것은 이미 라인업에
      // 들어간 선수를 중복 배정하는 것과 같다(스쿼드가 포메이션 인원수 미만일 때만
      // 발생 — MIN_SQUAD=14 > 11로 현재는 도달 불가). 조용히 오염된 라인업을
      // 만드는 대신 명확한 에러로 드러낸다.
      throw new Error(`defaultTactic: 스쿼드 인원(${club.players.length}명)이 포메이션 인원수보다 적습니다.`);
    }
    const pick = pool.sort((a, b) => slotScore(b, position) - slotScore(a, position))[0]!;
    used.add(pick.id);
    return { position, playerId: pick.id };
  });
  const mentality = computeAiMentality(club, ctx);
  return {
    formation,
    lineup,
    mentality,
    tempo: 0.5,
    pressing: computeAiPressing(ctx),
    width: computeAiWidth(formation, mentality),
    defensiveLine: computeAiDefensiveLine(formation, mentality, ctx),
    setPieceTakerId: pickSetPieceTaker(club, lineup),
    captainId: pickCaptain(club, lineup),
  };
}
