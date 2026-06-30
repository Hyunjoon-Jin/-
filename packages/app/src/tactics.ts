/**
 * 전술/라인업 유틸 (앱 측).
 * 포메이션 프리셋, 자동 베스트 XI, 스쿼드 변동 시 라인업 보정.
 */
import { currentAbility, type Club, type Player, type Position, type Tactic } from '@soccer-tycoon/engine';

export const FORMATIONS: Record<string, Position[]> = {
  '4-3-3': ['GK', 'DL', 'DC', 'DC', 'DR', 'MC', 'MC', 'MC', 'AML', 'ST', 'AMR'],
  '4-4-2': ['GK', 'DL', 'DC', 'DC', 'DR', 'ML', 'MC', 'MC', 'MR', 'ST', 'ST'],
  '4-2-3-1': ['GK', 'DL', 'DC', 'DC', 'DR', 'DM', 'DM', 'AML', 'AMC', 'AMR', 'ST'],
  '3-5-2': ['GK', 'DC', 'DC', 'DC', 'WBL', 'MC', 'MC', 'MC', 'WBR', 'ST', 'ST'],
};

export const FORMATION_NAMES = Object.keys(FORMATIONS);

function familiarity(p: Player, pos: Position): number {
  if (p.position === pos) return 1;
  return p.familiarity[pos] ?? 0.2;
}

/** 슬롯 적합도 점수: 포지션 숙련도 우선, 그다음 능력. */
function slotScore(p: Player, pos: Position): number {
  return familiarity(p, pos) * 1000 + currentAbility(p);
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
  return {
    formation: '4-3-3',
    lineup: autoPickLineup(club, '4-3-3'),
    mentality: 0.5,
    tempo: 0.5,
    pressing: 0.5,
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
      return { position: pos, playerId: prev.playerId };
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
  return { ...tactic, lineup };
}

/** 슬롯의 선수를 교체한 새 전술 반환(이미 다른 슬롯에 있으면 자리 교환). */
export function swapPlayer(tactic: Tactic, slotIndex: number, playerId: string): Tactic {
  const lineup = tactic.lineup.map((s) => ({ ...s }));
  const existing = lineup.findIndex((s) => s.playerId === playerId);
  if (existing >= 0 && existing !== slotIndex) {
    // 자리 교환
    lineup[existing]!.playerId = lineup[slotIndex]!.playerId;
  }
  lineup[slotIndex]!.playerId = playerId;
  return { ...tactic, lineup };
}
