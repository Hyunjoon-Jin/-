/**
 * 컵대회 (단판 녹아웃 토너먼트).
 * 리그와 병행. 매 라운드 생존 구단을 평판순 정렬해 상위-하위로 대진,
 * 단판 승부(무승부는 승부차기=동전)로 승자를 가린다. 홀수면 최상위 시드 부전승.
 * 경기 인프라(simulateMatch)와 상태 변화(applyMatchEffects)를 재사용한다.
 */
import type { Club, Tactic } from './types.js';
import { simulateMatch } from './simulateMatch.js';
import { applyMatchEffects } from './matchEffects.js';
import { defaultTactic } from './generate.js';
import { Rng } from './rng.js';

export interface CupTie {
  homeId: string;
  /** null = 부전승. */
  awayId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  /** 승부차기로 결정됐는지. */
  penalties: boolean;
  winnerId: string;
}

export interface CupRound {
  name: string;
  ties: CupTie[];
}

export interface CupState {
  /** 참가 구단(생성 시 평판순). */
  participantIds: string[];
  rounds: CupRound[];
  baseSeed: number;
  championId: string | null;
}

export function createCup(clubs: Club[], baseSeed: number): CupState {
  const participantIds = [...clubs]
    .sort((a, b) => b.finance.reputation - a.finance.reputation)
    .map((c) => c.id);
  return { participantIds, rounds: [], baseSeed, championId: null };
}

export function isCupOver(cup: CupState): boolean {
  return cup.championId !== null;
}

/** 현재 생존(다음 라운드 진출) 구단. */
export function cupSurvivors(cup: CupState): string[] {
  if (cup.championId) return [cup.championId];
  if (cup.rounds.length === 0) return cup.participantIds;
  return cup.rounds[cup.rounds.length - 1]!.ties.map((t) => t.winnerId);
}

function roundName(survivors: number): string {
  if (survivors <= 2) return '결승';
  if (survivors <= 4) return '준결승';
  if (survivors <= 8) return '8강';
  return '예선';
}

type TacticMap = Map<string, Tactic> | undefined;
function tacticFor(club: Club, tactics: TacticMap): Tactic {
  return tactics?.get(club.id) ?? defaultTactic(club);
}

/**
 * 현재 라운드 진행. 새 CupState를 반환하고, 구단 선수 상태(피로·부상)는 변경된다.
 */
export function playCupRound(cup: CupState, clubs: Club[], tactics?: TacticMap): CupState {
  if (cup.championId) return cup;
  const survivors = cupSurvivors(cup);
  if (survivors.length <= 1) {
    return { ...cup, championId: survivors[0] ?? null };
  }

  const byId = new Map(clubs.map((c) => [c.id, c]));
  const sorted = [...survivors].sort(
    (a, b) => byId.get(b)!.finance.reputation - byId.get(a)!.finance.reputation,
  );

  const roundIndex = cup.rounds.length;
  const seedBase = cup.baseSeed + roundIndex * 1000;
  const ties: CupTie[] = [];

  let arr = sorted;
  if (arr.length % 2 === 1) {
    // 최상위 시드 부전승
    const top = arr[0]!;
    ties.push({ homeId: top, awayId: null, homeScore: null, awayScore: null, penalties: false, winnerId: top });
    arr = arr.slice(1);
  }

  const m = arr.length;
  for (let i = 0; i < m / 2; i++) {
    const homeId = arr[i]!;
    const awayId = arr[m - 1 - i]!;
    const home = byId.get(homeId)!;
    const away = byId.get(awayId)!;
    const homeTactic = tacticFor(home, tactics);
    const awayTactic = tacticFor(away, tactics);
    const result = simulateMatch({
      home: { club: home, tactic: homeTactic },
      away: { club: away, tactic: awayTactic },
      seed: seedBase + i,
    });
    let winnerId: string;
    let penalties = false;
    if (result.score[0] > result.score[1]) winnerId = homeId;
    else if (result.score[1] > result.score[0]) winnerId = awayId;
    else {
      penalties = true;
      winnerId = new Rng(seedBase + i + 500).roll(0.5) ? homeId : awayId;
    }
    applyMatchEffects(home, homeTactic, away, awayTactic, result,
      new Rng(seedBase * 2 + i + 7919));
    ties.push({ homeId, awayId, homeScore: result.score[0], awayScore: result.score[1], penalties, winnerId });
  }

  const rounds = [...cup.rounds, { name: roundName(survivors.length), ties }];
  const newSurvivors = ties.map((t) => t.winnerId);
  const championId = newSurvivors.length === 1 ? newSurvivors[0]! : null;
  return { ...cup, rounds, championId };
}

/** 끝까지 진행(자동 완료). */
export function playCupToEnd(cup: CupState, clubs: Club[], tactics?: TacticMap): CupState {
  let cur = cup;
  let guard = 20;
  while (!cur.championId && guard-- > 0) {
    cur = playCupRound(cur, clubs, tactics);
  }
  return cur;
}
