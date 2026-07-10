/**
 * 스쿼드 목록 표시 설정(선수관리 개선 항목1·2·6) — 컬럼 표시/숨김, 밀도, 뷰(표/카드) 모드.
 * 구단과 무관한 순수 UI 취향이라 전역 1개 키에 저장한다.
 */
export type SquadDensity = 'default' | 'compact';
export type SquadViewMode = 'table' | 'cards';

export interface SquadViewSettings {
  hiddenColumns: string[];
  density: SquadDensity;
  viewMode: SquadViewMode;
  /** 드래그로 바꾼 컬럼 표시 순서(REORDERABLE_COLUMN_KEYS의 순열). */
  columnOrder: string[];
}

export const OPTIONAL_COLUMNS: { key: string; label: string }[] = [
  { key: 'potential', label: '잠재력' },
  { key: 'nationality', label: '국적' },
  { key: 'contract', label: '계약' },
  { key: 'value', label: '가치' },
  { key: 'wage', label: '주급' },
  { key: 'training', label: '훈련 포커스' },
];

/** 드래그로 순서를 바꿀 수 있는 컬럼(잠재력은 CA 옆에 고정 배치라 순서 변경 대상에서 제외). */
export const REORDERABLE_COLUMN_KEYS = OPTIONAL_COLUMNS
  .filter((c) => c.key !== 'potential')
  .map((c) => c.key);

const KEY = 'st_squad_view_settings';

const DEFAULT_SETTINGS: SquadViewSettings = {
  hiddenColumns: [],
  density: 'default',
  viewMode: 'table',
  columnOrder: REORDERABLE_COLUMN_KEYS,
};

/** 저장된 순서가 낡았거나(신규 컬럼 추가 등) 손상됐을 때, 알려진 키만 남기고 빠진 키는 뒤에 붙인다. */
function sanitizeColumnOrder(order: unknown): string[] {
  const known = Array.isArray(order) ? order.filter((k): k is string =>
    typeof k === 'string' && REORDERABLE_COLUMN_KEYS.includes(k)) : [];
  const missing = REORDERABLE_COLUMN_KEYS.filter((k) => !known.includes(k));
  return [...known, ...missing];
}

export function loadSquadViewSettings(storage: Storage = window.localStorage): SquadViewSettings {
  const raw = storage.getItem(KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(raw) as Partial<SquadViewSettings>;
    return {
      hiddenColumns: Array.isArray(parsed.hiddenColumns) ? parsed.hiddenColumns : [],
      density: parsed.density === 'compact' ? 'compact' : 'default',
      viewMode: parsed.viewMode === 'cards' ? 'cards' : 'table',
      columnOrder: sanitizeColumnOrder(parsed.columnOrder),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSquadViewSettings(settings: SquadViewSettings, storage: Storage = window.localStorage): void {
  storage.setItem(KEY, JSON.stringify(settings));
}
