/**
 * 라인업 → 팀 강도 7지표 산출 (engine.md 3장).
 * 선수별 보정 파생값을 라인별로 집계하고 전술로 가중한다.
 */
import type { Club, Line, Player, Position, Tactic, TeamStrength } from './types.js';
import { playerDerived, isAvailable, type DerivedRatings } from './derived.js';
import { clamp } from './math.js';

const LINE_OF: Record<Position, Line> = {
  GK: 'GK',
  DL: 'DEF', DC: 'DEF', DR: 'DEF', WBL: 'DEF', WBR: 'DEF',
  DM: 'MID', ML: 'MID', MC: 'MID', MR: 'MID',
  AML: 'ATT', AMC: 'ATT', AMR: 'ATT', ST: 'ATT',
};

export function lineOf(pos: Position): Line {
  return LINE_OF[pos];
}

interface SlotEval {
  line: Line;
  d: DerivedRatings;
}

function mean(nums: number[], fallback = 0): number {
  if (nums.length === 0) return fallback;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** 부상·정지로 라인 전체가 결장한 경우의 붕괴 페널티값 — 중립 폴백(25~30)과 달리
 *  "가용 인원 0"이라는 재앙적 상황을 시뮬레이션에 실제로 반영한다. */
const LINE_WIPED_PENALTY = 5;

/**
 * 특정 라인의 평균 능력치. 그 라인에 배정된 슬롯 자체가 없으면(포메이션에 없는 라인)
 * 중립 폴백값을, 슬롯은 있으나 전원 결장이면 붕괴 페널티를 반환한다.
 */
function lineMean(
  evald: SlotEval[], line: Line, slotCounts: Record<Line, number>,
  key: keyof DerivedRatings, neutralFallback: number,
): number {
  const nums = evald.filter((s) => s.line === line).map((s) => s.d[key]);
  if (nums.length > 0) return mean(nums);
  return slotCounts[line] > 0 ? LINE_WIPED_PENALTY : neutralFallback;
}

function lineSlotCounts(tactic: Tactic): Record<Line, number> {
  const counts: Record<Line, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const slot of tactic.lineup) counts[lineOf(slot.position)]++;
  return counts;
}

/** 여러 라인을 합쳐 평균(physical/aerial 등 전 라인 공통 지표용). 관련 라인 전체가
 *  결장이면(슬롯은 있었으나 가용 인원 0) 붕괴 페널티, 애초에 슬롯이 없으면 중립 폴백. */
function combinedLineMean(
  evald: SlotEval[], lines: Line[], slotCounts: Record<Line, number>,
  key: keyof DerivedRatings, neutralFallback: number,
): number {
  const nums = evald.filter((s) => lines.includes(s.line)).map((s) => s.d[key]);
  if (nums.length > 0) return mean(nums);
  const expectedSlots = lines.reduce((sum, l) => sum + slotCounts[l], 0);
  return expectedSlots > 0 ? LINE_WIPED_PENALTY : neutralFallback;
}

/**
 * 라인업의 각 슬롯을 평가.
 * 결번(선수 없음)인 슬롯은 약한 대체값으로 메운다.
 */
function evalLineup(club: Club, tactic: Tactic, isBigMatch: boolean): SlotEval[] {
  const byId = new Map(club.players.map((p) => [p.id, p]));
  const out: SlotEval[] = [];
  for (const slot of tactic.lineup) {
    const player = byId.get(slot.playerId);
    if (!player || !isAvailable(player)) continue; // 부상·정지 선수는 출전 불가(빈 슬롯 처리)
    out.push({ line: lineOf(slot.position), d: playerDerived(player, slot.position, isBigMatch) });
  }
  return out;
}

/**
 * 팀 강도 산출.
 * mentality는 공격/수비 자원 배분을 조정한다(공격적일수록 공격 가중↑, 수비 가중↓).
 * @param isBigMatch 라이벌전·컵 결승 등 — 빅게임 히어로/새가슴 특성에만 영향.
 */
export function computeTeamStrength(club: Club, tactic: Tactic, isBigMatch = false): TeamStrength {
  const slots = evalLineup(club, tactic, isBigMatch);
  const slotCounts = lineSlotCounts(tactic);

  const gkSlot = slots.find((s) => s.line === 'GK');

  // mentality 0~1 → 공격/수비 가중 (0.85~1.15 범위)
  const attBias = 0.85 + 0.30 * tactic.mentality;
  // 수비 배율은 선형 구간(0.85~1.15) 위에 "역습 실점 위험"을 비선형으로 얹는다.
  // mentality 0.5(중립)에서는 위험항이 정확히 0이라 기존 균형(중립 전술의 밸런스
  // 리포트 기준선)을 그대로 보존하고, 0.5를 넘어 공격적으로 갈수록 위험이 가속돼
  // "무리하게 밀어붙일수록 뒷공간을 크게 내준다"는 진짜 트레이드오프를 만든다.
  const attackRisk = Math.max(0, tactic.mentality - 0.5);
  const defBias = (1.15 - 0.30 * tactic.mentality) - 0.6 * attackRisk * attackRisk;
  // pressing 0~1 → 높은 압박은 볼 탈취(수비)와 탈취 후 전환(창출)을 함께 끌어올린다
  // (0.5가 중립). mentality처럼 소폭 가중치라 극단적으로 결과를 뒤집진 않는다.
  const pressDefBias = 1 + (tactic.pressing - 0.5) * 0.24;
  const pressCreationBias = 1 + (tactic.pressing - 0.5) * 0.12;

  // width 0~1 → 넓게 벌릴수록 측면을 활용한 창출력↑, 중앙 밀집이 옅어져 공중볼 다툼↓.
  const widthCreationBias = 1 + (tactic.width - 0.5) * 0.16;
  const widthAerialBias = 1 - (tactic.width - 0.5) * 0.12;

  // defensiveLine 0~1 → 라인을 올릴수록 전방 압박 구역이 넓어져 창출에 소폭 보탬이 되지만,
  // mentality와 같은 설계로 0.5를 넘어서면 뒷공간 노출 위험이 비선형으로 커진다.
  const lineCreationBias = 1 + (tactic.defensiveLine - 0.5) * 0.10;
  const lineRisk = Math.max(0, tactic.defensiveLine - 0.5);
  const lineDefBias = 1 - 0.5 * lineRisk * lineRisk;

  // 공격: 전방 선수의 attack + 중원의 일부 기여
  const attack = clamp(
    (lineMean(slots, 'ATT', slotCounts, 'attack', 30) * 0.75 +
      lineMean(slots, 'MID', slotCounts, 'attack', 25) * 0.25) * attBias,
    0, 110,
  );

  // 창출: 전방·중원의 creation (높은 압박으로 탈취한 공을 빠르게 전환, 넓은 폭·높은 라인이 가산)
  const creation = clamp(
    (lineMean(slots, 'ATT', slotCounts, 'creation', 30) * 0.55 +
      lineMean(slots, 'MID', slotCounts, 'creation', 30) * 0.45) *
      attBias * pressCreationBias * widthCreationBias * lineCreationBias,
    0, 110,
  );

  // 중원 장악: 미드 라인 + 수비형 가담
  const midfield = clamp(
    lineMean(slots, 'MID', slotCounts, 'midfield', 30) * 0.8 +
      lineMean(slots, 'DEF', slotCounts, 'midfield', 25) * 0.2,
    0, 110,
  );

  // 수비: 수비 라인 + 중원 수비 가담 (높은 압박은 상대 전개를 방해해 수비력에 가산,
  // 라인을 과하게 올리면 뒷공간 노출로 감산)
  const defense = clamp(
    (lineMean(slots, 'DEF', slotCounts, 'defense', 30) * 0.7 +
      lineMean(slots, 'MID', slotCounts, 'defense', 25) * 0.3) * defBias * pressDefBias * lineDefBias,
    0, 110,
  );

  const outfieldLines: Line[] = ['DEF', 'MID', 'ATT'];
  const physical = combinedLineMean(slots, outfieldLines, slotCounts, 'physical', 30);
  // 공중볼: 넓게 벌릴수록 박스 안 인원이 줄어 다툼에서 소폭 불리해진다.
  const aerial = clamp(
    combinedLineMean(slots, outfieldLines, slotCounts, 'aerial', 30) * widthAerialBias,
    0, 110,
  );
  // 골키퍼가 아예 없으면(부상·정지로 전원 결장) 중립 폴백(25) 대신 붕괴 페널티 —
  // 사실상 빈 골문인데 실점 확률이 소폭만 증가하던 문제를 막는다.
  const gk = gkSlot ? gkSlot.d.gk : (slotCounts.GK > 0 ? LINE_WIPED_PENALTY : 25);

  return { attack, creation, midfield, defense, physical, aerial, gk };
}
