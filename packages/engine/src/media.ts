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

/** 답변 성향: bold=자신감/책임 회피형, humble=겸손/책임 인정형. 감독 이미지 형성에 쓰인다. */
export type MediaStyle = 'bold' | 'humble';

/** 톤별 고정 성향(어떤 결과 유형에서 나오든 성향은 불변). */
export const MEDIA_TONE_STYLE: Record<MediaTone, MediaStyle> = {
  confident: 'bold',
  humble: 'humble',
  accountable: 'humble',
  blamePlayers: 'bold',
  blameRef: 'bold',
  satisfied: 'humble',
  frustrated: 'bold',
};

export interface MediaToneOption {
  tone: MediaTone;
  style: MediaStyle;
  /** 스쿼드 전원 사기 변화(0~1 스케일). */
  moraleDelta: number;
  /** 이사회 신뢰도 변화. */
  confidenceDelta: number;
}

const RAW_OPTIONS: Record<MediaEventKind, Omit<MediaToneOption, 'style'>[]> = {
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

const OPTIONS: Record<MediaEventKind, MediaToneOption[]> = Object.fromEntries(
  Object.entries(RAW_OPTIONS).map(([kind, opts]) => [
    kind,
    opts.map((o) => ({ ...o, style: MEDIA_TONE_STYLE[o.tone] })),
  ]),
) as Record<MediaEventKind, MediaToneOption[]>;

/** 최소 응답 수(이보다 적으면 이미지가 형성되지 않은 것으로 본다). */
const PERSONA_MIN_RESPONSES = 3;
/** 이 이상 성향 격차가 나야 이미지가 굳어진 것으로 본다. */
const PERSONA_GAP = 3;

export type ManagerPersona = 'bold' | 'humble' | 'neutral';

/** 누적 톤 성향 집계로 감독 이미지를 판정. 표본이 적거나 팽팽하면 neutral. */
export function classifyPersona(boldCount: number, humbleCount: number): ManagerPersona {
  if (boldCount + humbleCount < PERSONA_MIN_RESPONSES) return 'neutral';
  if (boldCount - humbleCount >= PERSONA_GAP) return 'bold';
  if (humbleCount - boldCount >= PERSONA_GAP) return 'humble';
  return 'neutral';
}

/** 경기 결과 분류(내 팀 관점 득점 비교). */
export function matchOutcomeKind(myGoals: number, oppGoals: number): MediaEventKind {
  if (myGoals > oppGoals) return 'win';
  if (myGoals < oppGoals) return 'loss';
  return 'draw';
}

/** 답변 톤 선택지(결과 유형별). 공유 모듈 상태의 원본 배열을 그대로 반환하면
 *  호출부가 이 배열을 변형(.sort() 등)할 때 이후 모든 호출·모든 구단의 톤
 *  옵션이 영구 오염되므로, 얕은 복사본을 반환한다. */
export function mediaToneOptions(kind: MediaEventKind): MediaToneOption[] {
  return [...OPTIONS[kind]];
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

/**
 * 감독 SNS 평판(고도화 항목19) — 누적 인터뷰 톤(bold/humble)을 팔로워 수·여론 지지율로
 * 시각화한다. 자신감 있는(bold) 답변은 화제성이 커 팔로워는 더 늘지만, 겸손한(humble)
 * 답변만큼 꾸준히 지지율을 쌓지는 못한다 — 화제성과 신뢰 사이의 트레이드오프.
 */
export const SNS_BASE_FOLLOWERS = 800;
const SNS_FOLLOWERS_PER_BOLD = 150;
const SNS_FOLLOWERS_PER_HUMBLE = 90;
const SNS_APPROVAL_BASE = 50;
const SNS_APPROVAL_PER_TONE_GAP = 2;

export interface SnsReputation {
  /** 누적 팔로워 수. */
  followers: number;
  /** 여론 지지율(0~100) — 겸손한 답변이 쌓일수록 오르고, 자신감 있는 답변이 쌓일수록 내린다. */
  approval: number;
}

/** 누적 인터뷰 톤 성향 집계로 SNS 팔로워 수·여론 지지율을 계산(순수 함수). */
export function snsReputation(boldCount: number, humbleCount: number): SnsReputation {
  const followers = SNS_BASE_FOLLOWERS + boldCount * SNS_FOLLOWERS_PER_BOLD + humbleCount * SNS_FOLLOWERS_PER_HUMBLE;
  const approval = clamp(SNS_APPROVAL_BASE + (humbleCount - boldCount) * SNS_APPROVAL_PER_TONE_GAP, 0, 100);
  return { followers, approval };
}
