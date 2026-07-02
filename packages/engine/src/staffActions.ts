/**
 * 스태프 업그레이드 (경영).
 * 보유 자금으로 코칭/의료/스카우팅을 한 단계씩 올린다. 비용은 레벨에 따라 증가.
 */
import type { Club, Staff } from './types.js';

export type StaffKind = keyof Staff;
export const STAFF_KINDS: StaffKind[] = ['coaching', 'medical', 'scouting', 'youth'];
export const STAFF_MAX = 20;

/** 현재 레벨에서 다음 레벨로 올리는 비용 (만원). */
export function upgradeCost(currentLevel: number): number {
  // 레벨 제곱 곡선: 5→3천만, 10→1.2억, 15→2.7억, 19→4.3억
  return currentLevel * currentLevel * 120;
}

export interface UpgradeResult { ok: boolean; cost?: number; newLevel?: number; reason?: string }

/** 스태프 한 단계 업그레이드. 구단 객체를 직접 변경한다. */
export function upgradeStaff(club: Club, kind: StaffKind): UpgradeResult {
  const level = club.staff[kind];
  if (level >= STAFF_MAX) return { ok: false, reason: `이미 최고 레벨(${STAFF_MAX})입니다.` };
  const cost = upgradeCost(level);
  if (club.finance.balance < cost) return { ok: false, reason: '보유 자금이 부족합니다.' };
  club.finance.balance -= cost;
  club.staff[kind] = level + 1;
  return { ok: true, cost, newLevel: level + 1 };
}
