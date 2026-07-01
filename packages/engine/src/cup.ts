/**
 * 컵대회 (단판 녹아웃 토너먼트).
 * 리그와 병행. 매 라운드 생존 구단을 평판순 정렬해 상위-하위로 대진,
 * 단판 승부(무승부는 승부차기=동전)로 승자를 가린다. 홀수면 최상위 시드 부전승.
 * 경기 인프라(simulateMatch)와 상태 변화(applyMatchEffects)를 재사용한다.
 */
import type { Club, MatchResult, Tactic } from './types.js';
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

export interface CupPairing {
  homeId: string;
  awayId: string;
  /** 이 경기의 시뮬 시드(관전 시 동일 시드로 LiveMatch 구성). */
  seed: number;
}

export interface NextCupRound {
  roundName: string;
  /** 홀수 인원 시 최상위 시드 부전승. */
  byeId: string | null;
  pairings: CupPairing[];
}

/**
 * 다음 라운드 대진(순수 함수, 상태 변경 없음).
 * 관전 셋업을 위해 앱이 내 경기와 시드를 미리 알 수 있게 한다.
 */
export function nextCupPairings(cup: CupState, clubs: Club[]): NextCupRound | null {
  if (cup.championId) return null;
  const survivors = cupSurvivors(cup);
  if (survivors.length <= 1) return null;

  const byId = new Map(clubs.map((c) => [c.id, c]));
  const sorted = [...survivors].sort(
    (a, b) => byId.get(b)!.finance.reputation - byId.get(a)!.finance.reputation,
  );
  const seedBase = cup.baseSeed + cup.rounds.length * 1000;

  let arr = sorted;
  let byeId: string | null = null;
  if (arr.length % 2 === 1) { byeId = arr[0]!; arr = arr.slice(1); }

  const m = arr.length;
  const pairings: CupPairing[] = [];
  for (let i = 0; i < m / 2; i++) {
    pairings.push({ homeId: arr[i]!, awayId: arr[m - 1 - i]!, seed: seedBase + i });
  }
  return { roundName: roundName(survivors.length), byeId, pairings };
}

/**
 * 현재 라운드 진행. 새 CupState를 반환하고, 구단 선수 상태(피로·부상)는 변경된다.
 * @param watched 내 관전 경기의 결과(해당 대진은 시뮬 대신 이 결과를 사용).
 */
export function playCupRound(
  cup: CupState, clubs: Club[], tactics?: TacticMap, watched?: MatchResult,
): CupState {
  if (cup.championId) return cup;
  const survivors = cupSurvivors(cup);
  if (survivors.length <= 1) {
    return { ...cup, championId: survivors[0] ?? null };
  }

  const next = nextCupPairings(cup, clubs)!;
  const byId = new Map(clubs.map((c) => [c.id, c]));
  const seedBase = cup.baseSeed + cup.rounds.length * 1000;
  const ties: CupTie[] = [];

  if (next.byeId) {
    ties.push({ homeId: next.byeId, awayId: null, homeScore: null, awayScore: null, penalties: false, winnerId: next.byeId });
  }

  next.pairings.forEach((pr, i) => {
    const home = byId.get(pr.homeId)!;
    const away = byId.get(pr.awayId)!;
    const homeTactic = tacticFor(home, tactics);
    const awayTactic = tacticFor(away, tactics);
    const result =
      watched && watched.homeClubId === pr.homeId && watched.awayClubId === pr.awayId
        ? watched
        : simulateMatch({
            home: { club: home, tactic: homeTactic },
            away: { club: away, tactic: awayTactic },
            seed: pr.seed,
          });
    let winnerId: string;
    let penalties = false;
    if (result.score[0] > result.score[1]) winnerId = pr.homeId;
    else if (result.score[1] > result.score[0]) winnerId = pr.awayId;
    else {
      penalties = true;
      winnerId = new Rng(pr.seed + 500).roll(0.5) ? pr.homeId : pr.awayId;
    }
    applyMatchEffects(home, homeTactic, away, awayTactic, result,
      new Rng(seedBase * 2 + i + 7919));
    ties.push({ homeId: pr.homeId, awayId: pr.awayId, homeScore: result.score[0], awayScore: result.score[1], penalties, winnerId });
  });

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
