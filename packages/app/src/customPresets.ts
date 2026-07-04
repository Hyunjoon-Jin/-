/**
 * 사용자 정의 전술 프리셋 — 티키타카/역습축구/게겐프레싱 3종 외에 직접 만든
 * 슬라이더 조합을 이름 붙여 저장. 세이브와 무관하게 localStorage에 영구 보존
 * (career.ts의 감독 커리어 아카이브와 동일한 저장 패턴).
 */
import type { Tactic } from '@soccer-tycoon/engine';

export type SliderKey = 'mentality' | 'tempo' | 'pressing' | 'width' | 'defensiveLine';

export interface CustomPreset {
  id: string;
  label: string;
  values: Pick<Tactic, SliderKey>;
}

const KEY = 'st_custom_tactic_presets';
const MAX_PRESETS = 12;

function readAll(storage: Storage): CustomPreset[] {
  const raw = storage.getItem(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as CustomPreset[];
  } catch {
    return [];
  }
}

/** 저장된 커스텀 프리셋 전체(저장 순). */
export function loadCustomPresets(storage: Storage = window.localStorage): CustomPreset[] {
  return readAll(storage);
}

/** 현재 슬라이더 값을 이름 붙여 저장. 상한(12개)을 넘으면 가장 오래된 것부터 제거. */
export function saveCustomPreset(
  label: string, values: Pick<Tactic, SliderKey>, storage: Storage = window.localStorage,
): CustomPreset[] {
  const trimmed = label.trim().slice(0, 20) || '전술';
  const preset: CustomPreset = {
    id: `cp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label: trimmed,
    values,
  };
  const all = [...readAll(storage), preset];
  const capped = all.length > MAX_PRESETS ? all.slice(-MAX_PRESETS) : all;
  storage.setItem(KEY, JSON.stringify(capped));
  return capped;
}

/** 커스텀 프리셋 삭제. */
export function deleteCustomPreset(id: string, storage: Storage = window.localStorage): CustomPreset[] {
  const remaining = readAll(storage).filter((p) => p.id !== id);
  storage.setItem(KEY, JSON.stringify(remaining));
  return remaining;
}
