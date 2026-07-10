/**
 * 라인업 프리셋(선수관리 개선 항목30) — 포메이션+선수 배치+개인 지시를 통째로 이름 붙여
 * 저장. customPresets.ts(슬라이더)·customFormations.ts(포지션 셰이프)와 같은 저장 패턴이되,
 * 선수 id를 담기 때문에 구단별로 분리 저장한다(다른 구단으로 이어하면 무의미해지므로).
 */
import type { Tactic } from '@soccer-tycoon/engine';

export interface LineupPreset {
  id: string;
  label: string;
  formation: string;
  lineup: Tactic['lineup'];
}

const KEY_PREFIX = 'st_lineup_presets_';
const MAX_PRESETS = 10;

function readAll(clubId: string, storage: Storage): LineupPreset[] {
  const raw = storage.getItem(KEY_PREFIX + clubId);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as LineupPreset[];
  } catch {
    return [];
  }
}

/** 구단별로 저장된 라인업 프리셋 전체(저장 순). */
export function loadLineupPresets(clubId: string, storage: Storage = window.localStorage): LineupPreset[] {
  return readAll(clubId, storage);
}

/** 현재 포메이션+라인업(개인 지시 포함)을 이름 붙여 저장. 상한(10개)을 넘으면 가장 오래된 것부터 제거. */
export function saveLineupPreset(
  clubId: string, label: string, formation: string, lineup: Tactic['lineup'],
  storage: Storage = window.localStorage,
): LineupPreset[] {
  const trimmed = label.trim().slice(0, 20) || '라인업';
  const preset: LineupPreset = {
    id: `lp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label: trimmed,
    formation,
    // 선수 id만 필요 — 저장 용량을 줄이고, 나중에 로드 시 최신 선수 상태를 다시 참조하게 한다.
    lineup: lineup.map((s) => ({ position: s.position, playerId: s.playerId, instruction: s.instruction })),
  };
  const all = [...readAll(clubId, storage), preset];
  const capped = all.length > MAX_PRESETS ? all.slice(-MAX_PRESETS) : all;
  storage.setItem(KEY_PREFIX + clubId, JSON.stringify(capped));
  return capped;
}

/** 라인업 프리셋 삭제. */
export function deleteLineupPreset(clubId: string, id: string, storage: Storage = window.localStorage): LineupPreset[] {
  const remaining = readAll(clubId, storage).filter((p) => p.id !== id);
  storage.setItem(KEY_PREFIX + clubId, JSON.stringify(remaining));
  return remaining;
}
