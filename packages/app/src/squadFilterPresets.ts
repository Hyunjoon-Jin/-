/**
 * 스쿼드 필터 프리셋(선수관리 개선 항목7) — 라인·검색·부상/재계약 토글 조합을 이름 붙여 저장.
 * 선수 id를 담지 않는 순수 필터 조건이라 구단과 무관하게 전역 1개 키에 저장한다.
 */
import type { Line } from '@soccer-tycoon/engine';

export interface SquadFilterPreset {
  id: string;
  label: string;
  line: 'ALL' | Line;
  search: string;
  troubledOnly: boolean;
  contractSoonOnly: boolean;
}

const KEY = 'st_squad_filter_presets';
const MAX_PRESETS = 10;

function readAll(storage: Storage): SquadFilterPreset[] {
  const raw = storage.getItem(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as SquadFilterPreset[];
  } catch {
    return [];
  }
}

export function loadSquadFilterPresets(storage: Storage = window.localStorage): SquadFilterPreset[] {
  return readAll(storage);
}

export function saveSquadFilterPreset(
  label: string, filter: Omit<SquadFilterPreset, 'id' | 'label'>, storage: Storage = window.localStorage,
): SquadFilterPreset[] {
  const trimmed = label.trim().slice(0, 20) || '필터';
  const preset: SquadFilterPreset = {
    id: `sfp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label: trimmed,
    ...filter,
  };
  const all = [...readAll(storage), preset];
  const capped = all.length > MAX_PRESETS ? all.slice(-MAX_PRESETS) : all;
  storage.setItem(KEY, JSON.stringify(capped));
  return capped;
}

export function deleteSquadFilterPreset(id: string, storage: Storage = window.localStorage): SquadFilterPreset[] {
  const remaining = readAll(storage).filter((p) => p.id !== id);
  storage.setItem(KEY, JSON.stringify(remaining));
  return remaining;
}
