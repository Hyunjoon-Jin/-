/**
 * 전술/라인업 유틸 (앱 측).
 * 포메이션 프리셋, 자동 베스트 XI, 스쿼드 변동 시 라인업 보정.
 */
import {
  currentAbility, isAvailable, FORMATIONS, FORMATION_NAMES, lineOf, hasTrait, isValidInstruction,
  type Club, type Player, type Position, type Tactic, type PlayerInstruction,
} from '@soccer-tycoon/engine';

export { FORMATIONS, FORMATION_NAMES };

function familiarity(p: Player, pos: Position): number {
  if (p.position === pos) return 1;
  return p.familiarity[pos] ?? 0.2;
}

/** 슬롯 적합도 점수: 부상·정지 선수는 최후순위, 그다음 포지션 숙련도, 능력 순. */
function slotScore(p: Player, pos: Position): number {
  const penalty = isAvailable(p) ? 0 : 1_000_000;
  return familiarity(p, pos) * 1000 + currentAbility(p) - penalty;
}

/** 세트피스 전담자 선정 점수 — 세트피스 스페셜리스트 특성이 있으면 소폭 가산(엔진 로직과 동일). */
function setPieceTakerScore(p: Player): number {
  return p.attributes.setPiece + (hasTrait(p, 'setPieceSpecialist') ? 3 : 0);
}

/** 라인업(ATT·MID) 중 세트피스 능력치(특성 가산 포함)가 가장 높은 선수를 전담자로 자동 지정. */
export function pickSetPieceTaker(club: Club, lineup: Tactic['lineup']): string | undefined {
  const byId = new Map(club.players.map((p) => [p.id, p]));
  const eligible = lineup
    .filter((s) => lineOf(s.position) === 'ATT' || lineOf(s.position) === 'MID')
    .map((s) => byId.get(s.playerId))
    .filter((p): p is Player => p !== undefined);
  if (eligible.length === 0) return undefined;
  return eligible.sort((a, b) => setPieceTakerScore(b) - setPieceTakerScore(a))[0]!.id;
}

/** 현재 전담자가 새 라인업의 ATT·MID 슬롯에 더는 없으면(포메이션·스쿼드 변동) 다시 자동 지정. */
export function ensureSetPieceTaker(club: Club, lineup: Tactic['lineup'], currentId?: string): string | undefined {
  const eligibleIds = new Set(
    lineup.filter((s) => lineOf(s.position) === 'ATT' || lineOf(s.position) === 'MID').map((s) => s.playerId),
  );
  if (currentId && eligibleIds.has(currentId)) return currentId;
  return pickSetPieceTaker(club, lineup);
}

/** 라인업 중 리더 특성 보유자를 우선하고, 없으면 리더십 능력치가 가장 높은 선수를 주장으로 자동 지정(엔진 로직과 동일). */
export function pickCaptain(club: Club, lineup: Tactic['lineup']): string | undefined {
  const byId = new Map(club.players.map((p) => [p.id, p]));
  const inLineup = lineup
    .map((s) => byId.get(s.playerId))
    .filter((p): p is Player => p !== undefined);
  if (inLineup.length === 0) return undefined;
  const leaders = inLineup.filter((p) => hasTrait(p, 'leader'));
  const pool = leaders.length > 0 ? leaders : inLineup;
  return [...pool].sort((a, b) => b.attributes.leadership - a.attributes.leadership)[0]!.id;
}

/** 현재 주장이 새 라인업에 더는 없으면(포메이션·스쿼드 변동) 다시 자동 지정. */
export function ensureCaptain(club: Club, lineup: Tactic['lineup'], currentId?: string): string | undefined {
  if (currentId && lineup.some((s) => s.playerId === currentId)) return currentId;
  return pickCaptain(club, lineup);
}

/** 포메이션에 맞춰 자동으로 베스트 XI를 뽑는다. */
export function autoPickLineup(club: Club, formation: string): Tactic['lineup'] {
  const positions = FORMATIONS[formation] ?? FORMATIONS['4-3-3']!;
  const used = new Set<string>();
  const lineup: Tactic['lineup'] = [];
  for (const pos of positions) {
    const pick = club.players
      .filter((p) => !used.has(p.id))
      .sort((a, b) => slotScore(b, pos) - slotScore(a, pos))[0];
    if (pick) {
      used.add(pick.id);
      lineup.push({ position: pos, playerId: pick.id });
    }
  }
  return lineup;
}

/** 기본 전술(4-3-3, 베스트 XI, 중립 슬라이더). */
export function makeDefaultTactic(club: Club): Tactic {
  const lineup = autoPickLineup(club, '4-3-3');
  return {
    formation: '4-3-3',
    lineup,
    mentality: 0.5,
    tempo: 0.5,
    pressing: 0.5,
    width: 0.5,
    defensiveLine: 0.5,
    setPieceTakerId: pickSetPieceTaker(club, lineup),
    captainId: pickCaptain(club, lineup),
  };
}

/**
 * 스쿼드 변동(이적·은퇴·유스) 후 라인업 보정.
 * 유효한 기존 배치는 슬롯 위치별로 유지하고, 빠진 자리는 베스트로 채운다.
 */
export function repairTactic(club: Club, tactic: Tactic): Tactic {
  const positions = FORMATIONS[tactic.formation] ?? FORMATIONS['4-3-3']!;
  const valid = new Set(club.players.map((p) => p.id));
  const used = new Set<string>();
  const slots: (Tactic['lineup'][number] | null)[] = positions.map((pos, i) => {
    const prev = tactic.lineup[i];
    if (prev && valid.has(prev.playerId) && !used.has(prev.playerId)) {
      used.add(prev.playerId);
      // 포메이션이 바뀌어 이 인덱스의 포지션이 달라졌다면(F10) 낡은 지시는 함께 버린다.
      const instruction = isValidInstruction(pos, prev.instruction) ? prev.instruction : undefined;
      return { position: pos, playerId: prev.playerId, instruction };
    }
    return null;
  });
  // 빈 슬롯을 베스트로 충원
  const lineup: Tactic['lineup'] = [];
  positions.forEach((pos, i) => {
    const slot = slots[i];
    if (slot) { lineup.push(slot); return; }
    const pick = club.players
      .filter((p) => !used.has(p.id))
      .sort((a, b) => slotScore(b, pos) - slotScore(a, pos))[0];
    if (pick) {
      used.add(pick.id);
      lineup.push({ position: pos, playerId: pick.id });
    }
  });
  return {
    ...tactic,
    lineup,
    setPieceTakerId: ensureSetPieceTaker(club, lineup, tactic.setPieceTakerId),
    captainId: ensureCaptain(club, lineup, tactic.captainId),
  };
}

/** 슬롯의 선수를 교체한 새 전술 반환(이미 다른 슬롯에 있으면 자리 교환).
 *  범위 밖 slotIndex는 non-null 단언이 런타임에 그대로 터지므로 먼저 걸러낸다. */
export function swapPlayer(tactic: Tactic, slotIndex: number, playerId: string): Tactic {
  if (slotIndex < 0 || slotIndex >= tactic.lineup.length) return tactic;
  const lineup = tactic.lineup.map((s) => ({ ...s }));
  const existing = lineup.findIndex((s) => s.playerId === playerId);
  if (existing >= 0 && existing !== slotIndex) {
    // 자리 교환
    lineup[existing]!.playerId = lineup[slotIndex]!.playerId;
  }
  lineup[slotIndex]!.playerId = playerId;
  return { ...tactic, lineup };
}

/** 슬롯에 개인 지시(F10)를 지정·해제한다(undefined면 해제). */
export function setPlayerInstruction(
  tactic: Tactic, slotIndex: number, instruction: PlayerInstruction | undefined,
): Tactic {
  if (slotIndex < 0 || slotIndex >= tactic.lineup.length) return tactic;
  const lineup = tactic.lineup.map((s, i) => (i === slotIndex ? { ...s, instruction } : s));
  return { ...tactic, lineup };
}
