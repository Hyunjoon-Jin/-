/**
 * 라인업 → 팀 강도 7지표 산출 (engine.md 3장).
 * 선수별 보정 파생값을 라인별로 집계하고 전술로 가중한다.
 */
import type { Club, Line, Player, Position, Tactic, TeamStrength } from './types.js';
import { playerDerived, type DerivedRatings } from './derived.js';
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

/**
 * 라인업의 각 슬롯을 평가.
 * 결번(선수 없음)인 슬롯은 약한 대체값으로 메운다.
 */
function evalLineup(club: Club, tactic: Tactic): SlotEval[] {
  const byId = new Map(club.players.map((p) => [p.id, p]));
  const out: SlotEval[] = [];
  for (const slot of tactic.lineup) {
    const player = byId.get(slot.playerId);
    if (!player) continue;
    out.push({ line: lineOf(slot.position), d: playerDerived(player, slot.position) });
  }
  return out;
}

/**
 * 팀 강도 산출.
 * mentality는 공격/수비 자원 배분을 조정한다(공격적일수록 공격 가중↑, 수비 가중↓).
 */
export function computeTeamStrength(club: Club, tactic: Tactic): TeamStrength {
  const slots = evalLineup(club, tactic);

  const gkSlot = slots.find((s) => s.line === 'GK');
  const def = slots.filter((s) => s.line === 'DEF');
  const mid = slots.filter((s) => s.line === 'MID');
  const att = slots.filter((s) => s.line === 'ATT');

  // mentality 0~1 → 공격/수비 가중 (0.85~1.15 범위)
  const attBias = 0.85 + 0.30 * tactic.mentality;
  const defBias = 1.15 - 0.30 * tactic.mentality;

  // 공격: 전방 선수의 attack + 중원의 일부 기여
  const attack = clamp(
    (mean(att.map((s) => s.d.attack), 30) * 0.75 +
      mean(mid.map((s) => s.d.attack), 25) * 0.25) * attBias,
    0, 110,
  );

  // 창출: 전방·중원의 creation
  const creation = clamp(
    (mean(att.map((s) => s.d.creation), 30) * 0.55 +
      mean(mid.map((s) => s.d.creation), 30) * 0.45) * attBias,
    0, 110,
  );

  // 중원 장악: 미드 라인 + 수비형 가담
  const midfield = clamp(
    mean(mid.map((s) => s.d.midfield), 30) * 0.8 +
      mean(def.map((s) => s.d.midfield), 25) * 0.2,
    0, 110,
  );

  // 수비: 수비 라인 + 중원 수비 가담
  const defense = clamp(
    (mean(def.map((s) => s.d.defense), 30) * 0.7 +
      mean(mid.map((s) => s.d.defense), 25) * 0.3) * defBias,
    0, 110,
  );

  const all = [...def, ...mid, ...att];
  const physical = mean(all.map((s) => s.d.physical), 30);
  const aerial = mean(all.map((s) => s.d.aerial), 30);
  const gk = gkSlot ? gkSlot.d.gk : 25;

  return { attack, creation, midfield, defense, physical, aerial, gk };
}
