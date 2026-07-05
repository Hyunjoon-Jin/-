/**
 * 컵대회 (단판 녹아웃 토너먼트).
 * 리그와 병행. 매 라운드 생존 구단을 평판순 정렬해 상위-하위로 대진,
 * 단판 승부(무승부는 승부차기=동전)로 승자를 가린다. 홀수면 최상위 시드 부전승.
 * 경기 인프라(simulateMatch)와 상태 변화(applyMatchEffects)를 재사용한다.
 */
import type { Club, MatchResult, Tactic } from './types.js';
import { simulateMatchWithAiTactics } from './aiInMatch.js';
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

/**
 * 라운드별 시드 베이스. 앱 레이어의 cup.baseSeed는 리그 시즌 시드(seasonSeed)와
 * 같은 seed+season*1000+k 패턴을 공유해서, 예전엔 단순히 +round*1000을 더하는
 * 선형 공식 탓에 리그 경기 시드와 컵 경기 시드가 특정 라운드·픽스처 조합에서
 * 정확히 같은 값이 되는 경우가 있었다(두 대회가 같은 난수를 공유). 큰 소수를
 * 곱해 리그 시드 패턴과의 선형 관계를 끊는다.
 */
function cupSeedBase(cup: CupState): number {
  return cup.baseSeed * 104_729 + cup.rounds.length * 97;
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

/** 결승 라운드 이름 — 문자열 리터럴을 여러 곳에 하드코딩하지 않도록 공유. */
export const CUP_FINAL_ROUND_NAME = '결승';

/**
 * 라운드 이름 — 이번 라운드 시작 시 생존자 수 기준, 결승까지 남은 라운드 수로
 * 결정한다(부전승으로 홀수여도 "남은 라운드 수"는 log2 반올림으로 안정적으로
 * 계산됨). 2의 거듭제곱이 아닌 인원(부전승 반복 등)에서는 관례상 명칭이
 * 근사치일 수밖에 없다 — 예: 5명 생존(부전승 1+경기 2)도 "8강"으로 표시되는데,
 * 이는 이 라운드 이후 3명이 남아 다음이 "준결승"이 되는 구조와 일치한다.
 */
function roundName(survivors: number): string {
  const roundsToFinal = Math.ceil(Math.log2(Math.max(2, survivors)));
  if (roundsToFinal <= 1) return CUP_FINAL_ROUND_NAME;
  if (roundsToFinal === 2) return '준결승';
  if (roundsToFinal === 3) return '8강';
  if (roundsToFinal === 4) return '16강';
  return '예선';
}

type TacticMap = Map<string, Tactic> | undefined;
/** tactics 맵에 없으면 AI 기본 전술 — 상대 전력·홈/원정·결승 여부를 참고한다. */
function tacticFor(
  club: Club, opponent: Club, isHome: boolean, isBigMatch: boolean, tactics: TacticMap,
): Tactic {
  return tactics?.get(club.id) ?? defaultTactic(club, { opponent, isHome, isBigMatch });
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
  const seedBase = cupSeedBase(cup);

  let arr = sorted;
  let byeId: string | null = null;
  if (arr.length % 2 === 1) {
    // 최상위 평판 구단이 매 홀수 라운드마다 부전승을 독점하지 않도록, 이미 부전승을
    // 받은 적 있는 구단(과거 라운드의 awayId===null 대진에서 확인)은 제외하고
    // 아직 안 받은 최상위 평판 구단을 우선한다. 전원이 이미 받았다면(극히 드묾)
    // 최상위 평판 구단으로 폴백.
    const alreadyHadBye = new Set(
      cup.rounds.flatMap((r) => r.ties.filter((t) => t.awayId === null).map((t) => t.homeId)),
    );
    const byeCandidate = arr.find((id) => !alreadyHadBye.has(id)) ?? arr[0]!;
    byeId = byeCandidate;
    arr = arr.filter((id) => id !== byeCandidate);
  }

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
  const seedBase = cupSeedBase(cup);
  const ties: CupTie[] = [];
  const isFinal = roundName(survivors.length) === CUP_FINAL_ROUND_NAME;

  if (next.byeId) {
    ties.push({ homeId: next.byeId, awayId: null, homeScore: null, awayScore: null, penalties: false, winnerId: next.byeId });
  }

  next.pairings.forEach((pr, i) => {
    const home = byId.get(pr.homeId)!;
    const away = byId.get(pr.awayId)!;
    const homeTactic = tacticFor(home, away, true, isFinal, tactics);
    const awayTactic = tacticFor(away, home, false, isFinal, tactics);
    const result =
      watched && watched.homeClubId === pr.homeId && watched.awayClubId === pr.awayId
        ? watched
        : simulateMatchWithAiTactics({
            home: { club: home, tactic: homeTactic },
            away: { club: away, tactic: awayTactic },
            seed: pr.seed,
            isBigMatch: isFinal,
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
