import type { ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';

// 센서 옵션은 매 렌더 새 객체를 넘기면 안 된다 — 드래그 시작 시 상태 갱신으로 인한
// 리렌더 때마다 센서가 재생성돼, 진행 중이던 드래그의 포인터 추적이 끊길 수 있다.
const POINTER_SENSOR_OPTIONS = { activationConstraint: { distance: 6 } };
const KEYBOARD_SENSOR_OPTIONS = { coordinateGetter: sortableKeyboardCoordinates };
// 슬롯 목록처럼 드래그 도중 레이아웃이 바뀔 수 있는 화면에서, 마운트 시 한 번만 잰
// 드롭 영역 좌표가 낡아버리는 것을 막기 위해 매 프레임 다시 측정한다.
const MEASURING_CONFIG = { droppable: { strategy: MeasuringStrategy.Always } };

interface DndScopeProps {
  children: ReactNode;
  onDragStart?: (e: DragStartEvent) => void;
  onDragEnd: (e: DragEndEvent) => void;
  onDragCancel?: () => void;
  /** 드래그 중 커서를 따라다니는 미리보기(선택 — 넘기지 않으면 원본 요소가 자리에 남는다). */
  dragOverlay?: ReactNode;
}

/**
 * 화면별 드래그앤드롭 범위를 감싸는 공용 컨텍스트.
 * 포인터 센서(살짝 눌러서 드래그하려는 의도가 뚜렷할 때만 시작 — 클릭 오작동 방지)와
 * 키보드 센서(방향키로 조작 가능, 마우스 없이도 동일 기능 보장)를 함께 등록한다.
 */
export function DndScope({ children, onDragStart, onDragEnd, onDragCancel, dragOverlay }: DndScopeProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, POINTER_SENSOR_OPTIONS),
    useSensor(KeyboardSensor, KEYBOARD_SENSOR_OPTIONS),
  );
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      measuring={MEASURING_CONFIG}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      {children}
      <DragOverlay>{dragOverlay}</DragOverlay>
    </DndContext>
  );
}

/** 드래그 가능한 카드/칩 하나에 필요한 ref·속성·상태를 묶어서 반환한다. */
export function useDraggableItem(id: string, data?: Record<string, unknown>, disabled?: boolean) {
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({ id, data, disabled });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;
  return { setNodeRef, attributes, listeners, isDragging, style };
}

/** 드롭 가능한 영역(슬롯) 하나에 필요한 ref·호버 상태를 반환한다. */
export function useDroppableZone(id: string, data?: Record<string, unknown>) {
  const { setNodeRef, isOver, active } = useDroppable({ id, data });
  return { setNodeRef, isOver, active };
}
