/**
 * 전술/라인업 유틸 (앱 측).
 * 포메이션 프리셋, 자동 베스트 XI, 스쿼드 변동 시 라인업 보정.
 */
import {
  currentAbility, isAvailable, FORMATIONS, FORMATION_NAMES, lineOf, hasTrait, isValidInstruction,
  rankCaptainCandidates,
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

/** 라인업 중 주장 추천 점수(신규 개선 항목 16, 엔진 로직과 동일)가 가장 높은 선수를 자동 지정. */
export function pickCaptain(club: Club, lineup: Tactic['lineup']): string | undefined {
  const byId = new Map(club.players.map((p) => [p.id, p]));
  const inLineup = lineup
    .map((s) => byId.get(s.playerId))
    .filter((p): p is Player => p !== undefined);
  if (inLineup.length === 0) return undefined;
  return rankCaptainCandidates(inLineup)[0]!.playerId;
}

/** 현재 주장이 새 라인업에 더는 없으면(포메이션·스쿼드 변동) 다시 자동 지정. */
export function ensureCaptain(club: Club, lineup: Tactic['lineup'], currentId?: string): string | undefined {
  if (currentId && lineup.some((s) => s.playerId === currentId)) return currentId;
  return pickCaptain(club, lineup);
}

/** 라인업 중 주장을 제외하고 주장 추천 점수가 가장 높은 선수를 부주장(고도화 항목14)으로 자동 지정. */
export function pickViceCaptain(club: Club, lineup: Tactic['lineup'], captainId?: string): string | undefined {
  const byId = new Map(club.players.map((p) => [p.id, p]));
  const inLineup = lineup
    .map((s) => byId.get(s.playerId))
    .filter((p): p is Player => p !== undefined && p.id !== captainId);
  if (inLineup.length === 0) return undefined;
  return rankCaptainCandidates(inLineup)[0]!.playerId;
}

/** 현재 부주장이 새 라인업에 없거나 주장과 겹치면(포메이션·스쿼드 변동) 다시 자동 지정. */
export function ensureViceCaptain(
  club: Club, lineup: Tactic['lineup'], currentId: string | undefined, captainId?: string,
): string | undefined {
  if (currentId && currentId !== captainId && lineup.some((s) => s.playerId === currentId)) return currentId;
  return pickViceCaptain(club, lineup, captainId);
}

/** 베스트 XI 자동 선발 성향(선수관리 개선 항목32) — 슬롯 간에 겹치는 우수 자원이 있을 때
 *  어느 라인에 먼저 배정할지 우선순위를 바꾼다. 기본(balanced)은 포메이션 슬롯 순서 그대로. */
export type LineupBias = 'balanced' | 'attacking' | 'defensive';

const BIAS_LINE_ORDER: Record<Exclude<LineupBias, 'balanced'>, ReturnType<typeof lineOf>[]> = {
  attacking: ['ATT', 'MID', 'DEF', 'GK'],
  defensive: ['DEF', 'GK', 'MID', 'ATT'],
};

/** 성향에 따라 포지션 배정 처리 순서(인덱스)를 재정렬 — 반환되는 라인업 배열 자체의 슬롯
 *  순서(포메이션 순서)는 그대로 유지되고, "누구를 먼저 뽑을지"만 바뀐다. */
function biasProcessingOrder(positions: Position[], bias: LineupBias): number[] {
  const idxs = positions.map((_, i) => i);
  if (bias === 'balanced') return idxs;
  const order = BIAS_LINE_ORDER[bias];
  return idxs.sort((a, b) => order.indexOf(lineOf(positions[a]!)) - order.indexOf(lineOf(positions[b]!)));
}

/**
 * 포메이션에 맞춰 자동으로 베스트 XI를 뽑는다.
 * @param customPositions 커스텀 포메이션(F14)의 슬롯 배열 — 넘기면 이름 대신 이걸 그대로 쓴다
 *   (커스텀 포메이션은 기본 4종과 달리 engine의 FORMATIONS에 등록돼 있지 않다).
 * @param bias 라인 간 우선순위(선수관리 개선 항목32) — 기본은 균형(포메이션 순서 그대로).
 */
export function autoPickLineup(
  club: Club, formation: string, customPositions?: Position[], bias: LineupBias = 'balanced',
): Tactic['lineup'] {
  const positions = customPositions ?? FORMATIONS[formation] ?? FORMATIONS['4-3-3']!;
  const used = new Set<string>();
  const picks = new Array<Tactic['lineup'][number] | null>(positions.length).fill(null);
  for (const idx of biasProcessingOrder(positions, bias)) {
    const pos = positions[idx]!;
    const pick = club.players
      .filter((p) => !used.has(p.id))
      .sort((a, b) => slotScore(b, pos) - slotScore(a, pos))[0];
    if (pick) {
      used.add(pick.id);
      picks[idx] = { position: pos, playerId: pick.id };
    }
  }
  return picks.filter((s): s is Tactic['lineup'][number] => s !== null);
}

/** 기본 전술(4-3-3, 베스트 XI, 중립 슬라이더). */
export function makeDefaultTactic(club: Club): Tactic {
  const lineup = autoPickLineup(club, '4-3-3');
  const captainId = pickCaptain(club, lineup);
  return {
    formation: '4-3-3',
    lineup,
    mentality: 0.5,
    tempo: 0.5,
    pressing: 0.5,
    width: 0.5,
    defensiveLine: 0.5,
    setPieceTakerId: pickSetPieceTaker(club, lineup),
    captainId,
    viceCaptainId: pickViceCaptain(club, lineup, captainId),
  };
}

/**
 * 스쿼드 변동(이적·은퇴·유스) 후 라인업 보정.
 * 유효한 기존 배치는 슬롯 위치별로 유지하고, 빠진 자리는 베스트로 채운다.
 * 포지션은 기존 라인업 슬롯에 이미 기록된 값을 그대로 쓴다(포메이션 이름으로 다시 찾지
 * 않음) — 커스텀 포메이션(F14)은 engine의 FORMATIONS 테이블에 등록돼 있지 않아, 이름
 * 기반 조회로는 커스텀 포메이션의 슬롯 구성을 복원할 수 없기 때문이다.
 */
export function repairTactic(club: Club, tactic: Tactic): Tactic {
  const positions = tactic.lineup.map((s) => s.position);
  const valid = new Set(club.players.map((p) => p.id));
  const used = new Set<string>();
  const slots: (Tactic['lineup'][number] | null)[] = positions.map((pos, i) => {
    const prev = tactic.lineup[i];
    if (prev && valid.has(prev.playerId) && !used.has(prev.playerId)) {
      used.add(prev.playerId);
      // 방어적 재검증(F10) — 정상 경로로는 항상 유효하지만, 상태가 손상됐을 가능성에 대비.
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
  const captainId = ensureCaptain(club, lineup, tactic.captainId);
  return {
    ...tactic,
    lineup,
    setPieceTakerId: ensureSetPieceTaker(club, lineup, tactic.setPieceTakerId),
    captainId,
    viceCaptainId: ensureViceCaptain(club, lineup, tactic.viceCaptainId, captainId),
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
