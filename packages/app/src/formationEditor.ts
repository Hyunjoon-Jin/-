/**
 * 커스텀 포메이션 드래그 에디터의 순수 로직(선수관리 개선 항목34/37) — UI(FormationPitchEditor.tsx)와
 * 분리해 순수 함수 단위로 테스트한다.
 */
import { POSITIONS, type Position } from '@soccer-tycoon/engine';
import { LINE_X, SIDE_Y } from './components/MatchPitch.js';

/** 텍스트 select 나열 대신 실제 피치 위에서 점을 드래그해 배치(항목34). Position은 연속 좌표가
 *  아니라 고정된 카테고리 값이라, 드롭 지점에서 가장 가까운 카테고리로 스냅한다. */
export const OUTFIELD_POSITIONS: Position[] = POSITIONS.filter((p) => p !== 'GK');

/** 좌우 짝이 있는(즉 편측) 포지션과 그 거울상 — 대칭 맞춤 도구(항목37)에 사용.
 *  DC·MC·AMC·ST 등 중앙 포지션은 짝이 없으므로 이 맵에 없고, 도구가 건드리지 않는다. */
const MIRROR_POS: Partial<Record<Position, Position>> = {
  DL: 'DR', DR: 'DL', WBL: 'WBR', WBR: 'WBL', ML: 'MR', MR: 'ML', AML: 'AMR', AMR: 'AML',
};
const FLANK_POSITIONS = new Set(Object.keys(MIRROR_POS) as Position[]);

/** 드롭 지점(x,y, 0~1)에서 가장 가까운 아웃필드 포지션. */
export function nearestPosition(x: number, y: number): Position {
  let best: Position = OUTFIELD_POSITIONS[0]!;
  let bestDist = Infinity;
  for (const p of OUTFIELD_POSITIONS) {
    const dx = LINE_X[p] - x;
    const dy = SIDE_Y[p] - y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best;
}

/** 좌우 대칭 자동 맞춤(선수관리 개선 항목37) — 편측 포지션(DL/DR 등)만 같은 깊이(라인)끼리
 *  묶어 위/아래로 짝짓고, 위쪽 슬롯의 역할을 거울상으로 아래쪽 슬롯에 강제한다. DC·MC·ST 같은
 *  중앙 포지션은 손대지 않고, 짝이 없는 편측 슬롯(예: DL 없이 DR만 있는 경우)도 그대로 둔다 —
 *  그렇지 않으면 짝이 없는 슬롯이 엉뚱하게 중앙 포지션으로 뭉개질 수 있다. */
export function mirrorSymmetry(outfield: Position[]): Position[] {
  const next = [...outfield];
  const flankIdxs = outfield.map((_, i) => i).filter((i) => FLANK_POSITIONS.has(outfield[i]!));
  const groups = new Map<number, number[]>();
  for (const i of flankIdxs) {
    const key = Math.round(LINE_X[outfield[i]!]! * 50);
    const arr = groups.get(key);
    if (arr) arr.push(i); else groups.set(key, [i]);
  }
  for (const idxs of groups.values()) {
    const order = [...idxs].sort((a, b) => SIDE_Y[outfield[a]!] - SIDE_Y[outfield[b]!]);
    const n = order.length;
    for (let i = 0; i < Math.floor(n / 2); i++) {
      const topIdx = order[i]!;
      const botIdx = order[n - 1 - i]!;
      next[botIdx] = MIRROR_POS[outfield[topIdx]!]!;
    }
  }
  return next;
}
