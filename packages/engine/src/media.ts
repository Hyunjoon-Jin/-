/**
 * 감독 인터뷰(미디어 이벤트) — 경기 후 기자 질문에 답변 톤을 선택하면
 * 스쿼드 사기와 이사회 신뢰도가 트레이드오프로 변한다(board.ts와 연동).
 */
import type { Rng } from './rng.js';
import type { Club } from './types.js';
import { clamp } from './math.js';
import { TUNING } from './tuning.js';

export type MediaEventKind = 'win' | 'draw' | 'loss';
export type MediaTone =
  | 'confident' | 'humble'
  | 'accountable' | 'blamePlayers' | 'blameRef'
  | 'satisfied' | 'frustrated';

export interface MediaToneOption {
  tone: MediaTone;
  /** 스쿼드 전원 사기 변화(0~1 스케일). */
  moraleDelta: number;
  /** 이사회 신뢰도 변화. */
  confidenceDelta: number;
}

const OPTIONS: Record<MediaEventKind, MediaToneOption[]> = {
  win: [
    { tone: 'confident', moraleDelta: 0.08, confidenceDelta: 1 },
    { tone: 'humble', moraleDelta: 0.03, confidenceDelta: 2 },
  ],
  loss: [
    { tone: 'accountable', moraleDelta: 0, confidenceDelta: 2 },
    { tone: 'blamePlayers', moraleDelta: -0.05, confidenceDelta: -1 },
    { tone: 'blameRef', moraleDelta: 0.02, confidenceDelta: -2 },
  ],
  draw: [
    { tone: 'satisfied', moraleDelta: 0.02, confidenceDelta: 1 },
    { tone: 'frustrated', moraleDelta: 0.01, confidenceDelta: 0 },
  ],
};

/** 경기 결과 분류(내 팀 관점 득점 비교). */
export function matchOutcomeKind(myGoals: number, oppGoals: number): MediaEventKind {
  if (myGoals > oppGoals) return 'win';
  if (myGoals < oppGoals) return 'loss';
  return 'draw';
}

/** 답변 톤 선택지(결과 유형별). */
export function mediaToneOptions(kind: MediaEventKind): MediaToneOption[] {
  return OPTIONS[kind];
}

/** 매 경기 인터뷰가 열릴 확률(전부는 아님 — 언론 관심이 있을 때만). */
export function shouldTriggerMediaEvent(rng: Rng): boolean {
  return rng.roll(TUNING.mediaEventChance);
}

/** 선택한 톤을 스쿼드 전원 사기에 반영(신뢰도는 board.ts 경로로 별도 적용). */
export function applyMediaTone(club: Club, option: MediaToneOption): void {
  for (const p of club.players) {
    p.morale = clamp(p.morale + option.moraleDelta, 0, 1);
  }
}
