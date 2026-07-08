/**
 * 로테이션 필요(과사용) 경고 리포트(고도화 항목30).
 * 연속 선발 출전이 임계값을 넘긴 선수를 뽑아, 로테이션 없이 계속 뛰면 추가
 * 피로가 붙는다는 사실을 사용자에게 미리 알린다(matchEffects.ts의 실제 판정과
 * 같은 임계값을 그대로 재사용).
 */
import type { Club, Player, Position } from './types.js';
import { ROTATION_WARNING_THRESHOLD } from './matchEffects.js';
import { isAvailable } from './derived.js';

export { ROTATION_WARNING_THRESHOLD };

export interface RotationWarningEntry {
  playerId: string;
  name: string;
  position: Position;
  consecutiveStarts: number;
  condition: number;
}

/** 부상·정지 중이 아닌 선수 중 연속 선발 출전이 임계값을 넘긴 순으로 정렬. */
export function buildRotationWarningReport(club: Club): RotationWarningEntry[] {
  return club.players
    .filter((p: Player) => isAvailable(p) && (p.consecutiveStarts ?? 0) > ROTATION_WARNING_THRESHOLD)
    .map((p) => ({
      playerId: p.id,
      name: p.name,
      position: p.position,
      consecutiveStarts: p.consecutiveStarts ?? 0,
      condition: p.condition,
    }))
    .sort((a, b) => b.consecutiveStarts - a.consecutiveStarts);
}
