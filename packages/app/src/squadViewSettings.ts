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
}

export const OPTIONAL_COLUMNS: { key: string; label: string }[] = [
  { key: 'potential', label: '잠재력' },
  { key: 'nationality', label: '국적' },
  { key: 'contract', label: '계약' },
  { key: 'value', label: '가치' },
  { key: 'wage', label: '주급' },
  { key: 'training', label: '훈련 포커스' },
];

const KEY = 'st_squad_view_settings';

const DEFAULT_SETTINGS: SquadViewSettings = {
  hiddenColumns: [],
  density: 'default',
  viewMode: 'table',
};

export function loadSquadViewSettings(storage: Storage = window.localStorage): SquadViewSettings {
  const raw = storage.getItem(KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(raw) as Partial<SquadViewSettings>;
    return {
      hiddenColumns: Array.isArray(parsed.hiddenColumns) ? parsed.hiddenColumns : [],
      density: parsed.density === 'compact' ? 'compact' : 'default',
      viewMode: parsed.viewMode === 'cards' ? 'cards' : 'table',
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSquadViewSettings(settings: SquadViewSettings, storage: Storage = window.localStorage): void {
  storage.setItem(KEY, JSON.stringify(settings));
}
