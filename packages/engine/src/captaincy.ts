/**
 * 주장 후보 추천 로직(신규 개선 항목 16).
 * 리더십 능력치를 중심으로, 리더 특성 보유·소속 기간(로열티)·국가대표 경험(캡)을 가산하고
 * 다혈질 특성(라커룸 마찰 유발)을 감산해 종합 점수를 낸다. 자동 주장 지정(generate.ts)과
 * 전술 화면의 후보 추천 UI가 이 하나의 점수 공식을 함께 사용한다.
 */
import type { Player } from './types.js';
import { hasTrait } from './traits.js';

/** 리더 특성 보유 시 가산점. */
const LEADER_TRAIT_BONUS = 4;
/** 다혈질 특성 보유 시 감산점(라커룸 마찰 위험). */
const HOTHEAD_PENALTY = 3;
/** 소속 시즌당 가산점(상한 있음) — 로열티가 쌓일수록 라커룸 장악력이 커진다는 가정. */
const TENURE_BONUS_PER_SEASON = 0.3;
const TENURE_BONUS_MAX = 3;
/** 국가대표 캡 5회당 가산점(상한 있음) — 큰 무대 경험. */
const CAPS_BONUS_PER_5 = 0.5;
const CAPS_BONUS_MAX = 3;

export interface CaptainCandidate {
  playerId: string;
  score: number;
  isLeaderTrait: boolean;
  isHothead: boolean;
}

/** 주장 적합도 종합 점수(높을수록 적합). */
export function captainScore(player: Player): number {
  let score = player.attributes.leadership;
  if (hasTrait(player, 'leader')) score += LEADER_TRAIT_BONUS;
  if (hasTrait(player, 'hothead')) score -= HOTHEAD_PENALTY;
  score += Math.min(TENURE_BONUS_MAX, (player.seasonsAtClub ?? 0) * TENURE_BONUS_PER_SEASON);
  score += Math.min(CAPS_BONUS_MAX, Math.floor((player.caps ?? 0) / 5) * CAPS_BONUS_PER_5);
  return score;
}

/** 주장 후보를 점수 내림차순으로 랭킹. */
export function rankCaptainCandidates(players: Player[]): CaptainCandidate[] {
  return players
    .map((p) => ({
      playerId: p.id,
      score: captainScore(p),
      isLeaderTrait: hasTrait(p, 'leader'),
      isHothead: hasTrait(p, 'hothead'),
    }))
    .sort((a, b) => b.score - a.score);
}
