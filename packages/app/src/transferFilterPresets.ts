/**
 * 이적시장 "내 스쿼드" 패널 필터 프리셋(선수관리 개선 항목41) — squadFilterPresets.ts와 같은
 * 저장 패턴이되, 이적시장 패널의 필터 구성(라인·나이대·최소 CA·부상 이력·검색)에 맞춘 것.
 */
import type { Line } from '@soccer-tycoon/engine';

export interface TransferFilterPreset {
  id: string;
  label: string;
  line: 'ALL' | Line;
  ageFilter: 'ALL' | 'young' | 'prime' | 'veteran';
  minCA: number;
  noInjuryOnly: boolean;
  search: string;
}

const KEY = 'st_transfer_filter_presets';
const MAX_PRESETS = 10;

function readAll(storage: Storage): TransferFilterPreset[] {
  const raw = storage.getItem(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as TransferFilterPreset[];
  } catch {
    return [];
  }
}

export function loadTransferFilterPresets(storage: Storage = window.localStorage): TransferFilterPreset[] {
  return readAll(storage);
}

export function saveTransferFilterPreset(
  label: string, filter: Omit<TransferFilterPreset, 'id' | 'label'>, storage: Storage = window.localStorage,
): TransferFilterPreset[] {
  const trimmed = label.trim().slice(0, 20) || '필터';
  const preset: TransferFilterPreset = {
    id: `tfp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label: trimmed,
    ...filter,
  };
  const all = [...readAll(storage), preset];
  const capped = all.length > MAX_PRESETS ? all.slice(-MAX_PRESETS) : all;
  storage.setItem(KEY, JSON.stringify(capped));
  return capped;
}

export function deleteTransferFilterPreset(id: string, storage: Storage = window.localStorage): TransferFilterPreset[] {
  const remaining = readAll(storage).filter((p) => p.id !== id);
  storage.setItem(KEY, JSON.stringify(remaining));
  return remaining;
}
