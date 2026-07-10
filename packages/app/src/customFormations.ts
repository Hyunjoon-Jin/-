/**
 * 커스텀 포메이션(F14) — 기본 4종 프리셋 외에 사용자가 직접 정의한 포메이션.
 * 세이브와 무관하게 localStorage에 영구 보존(customPresets.ts와 동일한 저장 패턴).
 */
import type { Position } from '@soccer-tycoon/engine';

export interface CustomFormation {
  id: string;
  label: string;
  /** 정확히 11개, 슬롯 1은 항상 GK(에디터가 그렇게 강제해서 만들어짐). */
  positions: Position[];
  /** 목록 필터링용 자유 태그(선수관리 개선 항목38, 예: "역습형"). */
  tags?: string[];
}

const KEY = 'st_custom_formations';
const MAX_FORMATIONS = 8;

function readAll(storage: Storage): CustomFormation[] {
  const raw = storage.getItem(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as CustomFormation[];
  } catch {
    return [];
  }
}

/** 저장된 커스텀 포메이션 전체(저장 순). */
export function loadCustomFormations(storage: Storage = window.localStorage): CustomFormation[] {
  return readAll(storage);
}

/** 정확히 11슬롯 · GK 정확히 1명이어야 유효한 포메이션. */
export function isValidFormationPositions(positions: Position[]): boolean {
  return positions.length === 11 && positions.filter((p) => p === 'GK').length === 1;
}

/** 새 커스텀 포메이션을 이름 붙여 저장. 상한(8개)을 넘으면 가장 오래된 것부터 제거. */
export function saveCustomFormation(
  label: string, positions: Position[], tags: string[] = [], storage: Storage = window.localStorage,
): CustomFormation[] {
  if (!isValidFormationPositions(positions)) return readAll(storage);
  const trimmed = label.trim().slice(0, 20) || '포메이션';
  const formation: CustomFormation = {
    id: `cf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label: trimmed,
    positions,
    tags: tags.length > 0 ? tags : undefined,
  };
  const all = [...readAll(storage), formation];
  const capped = all.length > MAX_FORMATIONS ? all.slice(-MAX_FORMATIONS) : all;
  storage.setItem(KEY, JSON.stringify(capped));
  return capped;
}

/** 커스텀 포메이션 삭제. */
export function deleteCustomFormation(id: string, storage: Storage = window.localStorage): CustomFormation[] {
  const remaining = readAll(storage).filter((f) => f.id !== id);
  storage.setItem(KEY, JSON.stringify(remaining));
  return remaining;
}
