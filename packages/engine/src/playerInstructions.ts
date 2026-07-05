/**
 * 개인 선수 지시(F10) — 팀 단위 슬라이더보다 세밀한, 슬롯별 지시.
 * 전담마크는 특정 선수가 아니라 "상대 라인업의 어느 포지션"을 대상으로 지정한다 —
 * 상대가 그 자리에 누구를 세우든 그 슬롯의 선수를 마크한다(포메이션 대 포메이션 사고방식).
 */
import type { Player, Position, Tactic } from './types.js';
import { isAvailable } from './derived.js';
import { clamp } from './math.js';

export type PlayerInstructionKind = 'manMark' | 'cutInside';

export interface PlayerInstruction {
  kind: PlayerInstructionKind;
  /** manMark 전용 — 전담마크할 상대 라인업 슬롯의 포지션. */
  targetPosition?: Position;
}

/** 전담마크 지시가 가능한 슬롯(수비 라인 + 수비형 미드필더). */
export const MAN_MARK_POSITIONS: Position[] = ['DL', 'DC', 'DR', 'WBL', 'WBR', 'DM'];
/** 좁혀 들어오기 지시가 가능한 슬롯(측면 자원). */
export const CUT_INSIDE_POSITIONS: Position[] = ['ML', 'MR', 'AML', 'AMR'];

/** 슬롯 포지션 기준으로 부여 가능한 지시 종류. */
export function eligibleInstructionKinds(position: Position): PlayerInstructionKind[] {
  const kinds: PlayerInstructionKind[] = [];
  if (MAN_MARK_POSITIONS.includes(position)) kinds.push('manMark');
  if (CUT_INSIDE_POSITIONS.includes(position)) kinds.push('cutInside');
  return kinds;
}

/** 슬롯 포지션 기준으로 지시가 유효한지 — 포메이션 변경 후 낡은 지시가 남아있을 수 있어 사용 시점에 다시 확인한다. */
export function isValidInstruction(position: Position, instruction: PlayerInstruction | undefined): boolean {
  if (!instruction) return true;
  if (instruction.kind === 'manMark') {
    return MAN_MARK_POSITIONS.includes(position) && instruction.targetPosition !== undefined;
  }
  return CUT_INSIDE_POSITIONS.includes(position);
}

/** 좁혀 들어오기 — 슛 관여도(선택 가중치) 배수. */
export const CUT_INSIDE_WEIGHT_MUL = 1.5;
/** 좁혀 들어오기 — 중앙으로 좁혀 들어와 만드는 더 나은 슈팅 각도의 득점 확률 배수. */
export const CUT_INSIDE_XG_MUL = 1.06;

const MAN_MARK_BASE_WEIGHT_MUL = 0.6;
const MAN_MARK_BASE_XG_MUL = 0.88;

/** 전담마크 — 마크맨의 marking과 공격수의 dribbling 격차만큼 억제 효과가 커지거나 작아진다. */
export function manMarkWeightMultiplier(marker: Player, target: Player): number {
  const gap = clamp((marker.attributes.marking - target.attributes.dribbling) * 0.015, -0.2, 0.2);
  return clamp(MAN_MARK_BASE_WEIGHT_MUL - gap, 0.35, 0.85);
}

export function manMarkXgMultiplier(marker: Player, target: Player): number {
  const gap = clamp((marker.attributes.marking - target.attributes.dribbling) * 0.008, -0.1, 0.1);
  return clamp(MAN_MARK_BASE_XG_MUL - gap, 0.7, 0.95);
}

/** 공격 측 라인업에서 target을 전담마크 중인 수비 슬롯의 선수를 찾는다(없거나 결장이면 null). */
export function findManMarker(
  targetId: string, attTactic: Tactic, defTactic: Tactic, defPlayers: Player[],
): Player | null {
  const targetSlot = attTactic.lineup.find((s) => s.playerId === targetId);
  if (!targetSlot) return null;
  const markerSlot = defTactic.lineup.find(
    (s) => s.instruction?.kind === 'manMark'
      && isValidInstruction(s.position, s.instruction)
      && s.instruction.targetPosition === targetSlot.position,
  );
  if (!markerSlot) return null;
  const marker = defPlayers.find((p) => p.id === markerSlot.playerId);
  return marker && isAvailable(marker) ? marker : null;
}
