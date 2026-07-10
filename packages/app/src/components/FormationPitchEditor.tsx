import { useRef, useState, type PointerEvent } from 'react';
import type { Position } from '@soccer-tycoon/engine';
import { formationCoords } from './MatchPitch.js';
import { nearestPosition } from '../formationEditor.js';

export { OUTFIELD_POSITIONS, mirrorSymmetry } from '../formationEditor.js';

interface Props {
  /** 11슬롯, [0]은 항상 GK(고정, 드래그 불가). */
  positions: Position[];
  onChange: (outfieldIndex: number, pos: Position) => void;
}

/** 미니 피치 위에 11개 슬롯을 점으로 그려 드래그로 재배치하는 에디터(선수관리 개선 항목34). */
export function FormationPitchEditor({ positions, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);

  const coords = formationCoords(positions);

  function relativeFromEvent(e: PointerEvent): { x: number; y: number } {
    const rect = containerRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { x, y };
  }

  function handlePointerDown(i: number, e: PointerEvent<HTMLButtonElement>) {
    if (i === 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragIndex(i);
    setDragPos(relativeFromEvent(e));
  }
  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (dragIndex === null) return;
    setDragPos(relativeFromEvent(e));
  }
  function commitDrag() {
    if (dragIndex === null || !dragPos) return;
    onChange(dragIndex - 1, nearestPosition(dragPos.x, dragPos.y));
    setDragIndex(null);
    setDragPos(null);
  }

  return (
    <div
      className="formation-pitch-editor"
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={commitDrag}
    >
      <div className="fpe-halfway" />
      <div className="fpe-center-circle" />
      {positions.map((pos, i) => {
        const live = dragIndex === i && dragPos ? dragPos : coords[i]!;
        return (
          <button
            key={i}
            type="button"
            className={`fpe-slot${i === 0 ? ' fpe-slot-gk' : ''}${dragIndex === i ? ' dragging' : ''}`}
            style={{ left: `${live.x * 100}%`, top: `${live.y * 100}%` }}
            onPointerDown={(e) => handlePointerDown(i, e)}
            title={i === 0 ? 'GK(고정)' : `슬롯 ${i + 1} · ${pos} — 드래그해서 위치 변경`}
          >
            {pos}
          </button>
        );
      })}
    </div>
  );
}
