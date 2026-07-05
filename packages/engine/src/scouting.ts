/**
 * 스카우팅 리포트 (콘텐츠 심화).
 * 선수의 원시 수치를 등급·프로필로 분류해 서술형 평가의 재료를 만든다.
 * 실제 한국어 문구 조립은 UI(app)에서 담당 — 여기서는 분류만 결정론적으로 산출한다.
 */
import type { AttrKey, Club, Line, Player, Position } from './types.js';
import { MENTAL_ATTRS, GOALKEEPING_ATTRS } from './types.js';
import { currentAbility } from './derived.js';
import { lineOf } from './teamStrength.js';
import { DERIVED_WEIGHTS } from './roleWeights.js';

export type OverallTier = 'worldClass' | 'star' | 'quality' | 'squad' | 'fringe';
export type PotentialTier = 'generational' | 'high' | 'moderate' | 'limited' | 'unknown';
export type AgeProfile = 'wonderkid' | 'prime' | 'veteran' | 'declining';

/**
 * 스카우팅 레벨에 따라 아카데미 유스 선수의 국적 후보 풀이 단계적으로 넓어진다.
 * 레벨이 낮은 구단은 소수 핵심 국가 위주로만 유망주를 배출하고, 스카우팅에
 * 투자할수록 해외 네트워크가 넓어져 더 다양한 국적의 유망주가 나온다.
 */
const ACADEMY_NATION_TIERS: { minScouting: number; nations: string[] }[] = [
  { minScouting: 0, nations: ['KOR', 'JPN', 'ENG', 'ESP'] },
  { minScouting: 8, nations: ['GER', 'ITA', 'FRA'] },
  { minScouting: 15, nations: ['BRA', 'NED', 'ARG'] },
];

/** 주어진 스카우팅 레벨에서 아카데미 유입이 가능한 국적 목록(레벨이 오를수록 누적 확장). */
export function academyNationPool(scoutingLevel: number): string[] {
  return ACADEMY_NATION_TIERS
    .filter((t) => scoutingLevel >= t.minScouting)
    .flatMap((t) => t.nations);
}

export interface ScoutingReport {
  overallTier: OverallTier;
  potentialTier: PotentialTier;
  ageProfile: AgeProfile;
  /** 포지션 관련 능력 중 상위 3개(강점). */
  strengths: AttrKey[];
  /** 포지션 관련 능력 중 하위 3개(약점). */
  weaknesses: AttrKey[];
}

/** 현재 능력(CA, 0~200 척도) → 전체적 등급. */
function overallTierOf(ca: number): OverallTier {
  if (ca >= 170) return 'worldClass';
  if (ca >= 145) return 'star';
  if (ca >= 120) return 'quality';
  if (ca >= 90) return 'squad';
  return 'fringe';
}

/** 나이 → 프로필. */
function ageProfileOf(age: number): AgeProfile {
  if (age <= 20) return 'wonderkid';
  if (age <= 29) return 'prime';
  if (age <= 33) return 'veteran';
  return 'declining';
}

/**
 * 잠재력 등급. 스카우팅 레벨이 낮으면(<8) 미상 처리하고, 노장(30세 이상)은
 * PA-CA 갭과 무관하게 실현 가능성이 낮아 제한적으로 취급한다.
 */
function potentialTierOf(gap: number, age: number, scoutingLevel: number): PotentialTier {
  if (scoutingLevel < 8) return 'unknown';
  if (age >= 30) return 'limited';
  if (gap >= 50) return scoutingLevel >= 14 ? 'generational' : 'high';
  if (gap >= 22) return 'high';
  if (gap >= 8) return 'moderate';
  return 'limited';
}

function attrKeysOf(weights: Partial<Record<AttrKey, number>>): AttrKey[] {
  return Object.keys(weights) as AttrKey[];
}

const LINE_ATTR_POOL: Record<Exclude<Line, 'GK'>, AttrKey[]> = {
  ATT: [...new Set([
    ...attrKeysOf(DERIVED_WEIGHTS.attack), ...attrKeysOf(DERIVED_WEIGHTS.creation),
    ...attrKeysOf(DERIVED_WEIGHTS.physical),
  ])],
  MID: [...new Set([
    ...attrKeysOf(DERIVED_WEIGHTS.midfield), ...attrKeysOf(DERIVED_WEIGHTS.creation),
  ])],
  DEF: [...new Set([
    ...attrKeysOf(DERIVED_WEIGHTS.defense), ...attrKeysOf(DERIVED_WEIGHTS.physical),
    ...attrKeysOf(DERIVED_WEIGHTS.aerial),
  ])],
};

/** 포지션과 관련 있는 능력 풀 — 라인(공격/미드/수비)별 세부 부분집합으로 제한한다.
 *  예전엔 필드 플레이어 전원이 같은 통짜 풀(TECHNICAL+MENTAL+PHYSICAL 전체)을 써서,
 *  스트라이커의 "약점"에 태클링·마크 같은 무관한 수비 능력치가 흔히 등장했다. */
function relevantAttrs(position: Position): readonly AttrKey[] {
  if (position === 'GK') return [...GOALKEEPING_ATTRS, ...MENTAL_ATTRS];
  return LINE_ATTR_POOL[lineOf(position) as Exclude<Line, 'GK'>];
}

/** 선수 평가 리포트 산출(결정론적, 순수 함수). */
export function buildScoutingReport(player: Player, scoutingLevel: number): ScoutingReport {
  const ca = currentAbility(player);
  const pool = relevantAttrs(player.position);
  const sorted = [...pool].sort((a, b) => player.attributes[b] - player.attributes[a]);

  return {
    overallTier: overallTierOf(ca),
    potentialTier: potentialTierOf(player.potential - ca, player.age, scoutingLevel),
    ageProfile: ageProfileOf(player.age),
    strengths: sorted.slice(0, 3),
    weaknesses: sorted.slice(-3).reverse(),
  };
}

// ── 스카우트 파견 (B13) ──
// 스카우팅 스태프의 "안개" 판정(등급 기반)과 별개로, 특정 선수 한 명을 지목해
// 스카우트를 직접 파견하면 비용을 내고 그 선수만 영구적으로 정확한 PA를 알아낸다.
// 스카우팅 레벨이 높을수록(이미 갖춰진 네트워크가 넓을수록) 파견 비용이 저렴해진다.

const SCOUT_DISPATCH_BASE_COST = 300;
const SCOUT_DISPATCH_MIN_COST = 50;
const SCOUT_DISPATCH_COST_PER_LEVEL = 12;

/** 특정 선수를 파견 정찰하는 데 드는 비용(만원) — 스카우팅 레벨이 높을수록 저렴해진다. */
export function scoutDispatchCost(scoutingLevel: number): number {
  return Math.max(SCOUT_DISPATCH_MIN_COST, SCOUT_DISPATCH_BASE_COST - scoutingLevel * SCOUT_DISPATCH_COST_PER_LEVEL);
}

export interface ScoutDispatchResult { ok: boolean; cost?: number; reason?: string }

/** 선수 한 명을 콕 집어 스카우트를 파견한다. 성공하면 club.scoutedPlayerIds에 영구
 *  등록되어(세이브에도 남음) 이후 club.staff.scouting 레벨과 무관하게 항상 정확한
 *  PA를 볼 수 있다. 같은 선수를 다시 파견할 필요는 없다(이미 파견된 선수는 거절). */
export function dispatchScout(club: Club, playerId: string): ScoutDispatchResult {
  const scouted = club.scoutedPlayerIds ?? (club.scoutedPlayerIds = []);
  if (scouted.includes(playerId)) return { ok: false, reason: '이미 파견을 마쳐 정보를 확보한 선수입니다.' };
  const cost = scoutDispatchCost(club.staff.scouting);
  if (club.finance.balance < cost) return { ok: false, reason: '보유 자금이 부족합니다.' };
  club.finance.balance -= cost;
  scouted.push(playerId);
  return { ok: true, cost };
}
