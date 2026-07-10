import { useRef, useState, type PointerEvent } from 'react';
import type { Position } from '@soccer-tycoon/engine';
import { formationCoords, LINE_X, SIDE_Y } from './MatchPitch.js';
import { nearestPosition, OUTFIELD_POSITIONS } from '../formationEditor.js';

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

/**
 * 전담마크 대상 포지션을 미니 피치 위에서 드래그로 지정한다(선수관리 전면 도입 D31).
 * FormationPitchEditor와 같은 포인터-드래그·최근접 스냅(nearestPosition) 방식을 재사용하되,
 * 슬롯이 하나뿐이라 재배치할 포메이션 없이 단일 마커만 다룬다. select 드롭다운은 그대로
 * 남아 키보드·터치 접근성 대체 경로 역할을 한다.
 */
export function ManMarkTargetPicker({ value, onChange, disabled }: {
  value: Position; onChange: (pos: Position) => void; disabled?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);

  function relativeFromEvent(e: PointerEvent): { x: number; y: number } {
    const rect = containerRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { x, y };
  }
  function handlePointerDown(e: PointerEvent<HTMLButtonElement>) {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragPos(relativeFromEvent(e));
  }
  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (dragPos === null) return;
    setDragPos(relativeFromEvent(e));
  }
  function commitDrag() {
    if (dragPos === null) return;
    onChange(nearestPosition(dragPos.x, dragPos.y));
    setDragPos(null);
  }

  const live = dragPos ?? { x: LINE_X[value], y: SIDE_Y[value] };

  return (
    <div
      className={`mark-target-picker${disabled ? ' disabled' : ''}`}
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={commitDrag}
    >
      <div className="fpe-halfway" />
      {OUTFIELD_POSITIONS.map((pos) => (
        <span
          key={pos}
          className={`mtp-ref-dot${pos === value ? ' active' : ''}`}
          style={{ left: `${LINE_X[pos] * 100}%`, top: `${SIDE_Y[pos] * 100}%` }}
        />
      ))}
      <button
        type="button"
        className="mtp-marker"
        style={{ left: `${live.x * 100}%`, top: `${live.y * 100}%` }}
        onPointerDown={handlePointerDown}
        disabled={disabled}
        title={`전담마크 대상: ${value} — 드래그해서 변경`}
      >
        {value}
      </button>
    </div>
  );
}
