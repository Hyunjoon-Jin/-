/**
 * 컵대회 (단판 녹아웃 토너먼트).
 * 리그와 병행. 매 라운드 생존 구단을 시드 포트로 나눠 추첨식으로 대진,
 * 단판 승부(무승부는 승부차기=동전)로 승자를 가린다. 홀수면 최상위 시드 부전승.
 * twoLegKnockout이 설정된 컵(대륙컵)은 준결승·결승만 2레그 홈&어웨이 합산제로
 * 진행한다(고도화 항목33). 경기 인프라(simulateMatch)와 상태 변화
 * (applyMatchEffects)를 재사용한다.
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
  /**
   * 2레그(홈&어웨이 합산) 방식일 때만 존재 — 2차전 스코어(homeId/awayId 기준,
   * 원정 다득점 규정 계산용). homeScore/awayScore는 항상 1차전 스코어를
   * 나타낸다(고도화 항목33).
   */
  secondLeg?: { homeGoals: number; awayGoals: number };
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
  /**
   * true면 준결승·결승을 단판이 아닌 2레그(홈&어웨이 합산, 동률 시 원정 다득점
   * 우선, 그래도 동률이면 승부차기)로 진행한다. 대륙컵 전용(고도화 항목33) —
   * 국내컵은 지정하지 않아 기존과 동일한 단판 방식을 유지한다.
   */
  twoLegKnockout?: boolean;
}

export function createCup(clubs: Club[], baseSeed: number, twoLegKnockout?: boolean): CupState {
  const participantIds = [...clubs]
    .sort((a, b) => b.finance.reputation - a.finance.reputation)
    .map((c) => c.id);
  return { participantIds, rounds: [], baseSeed, championId: null, twoLegKnockout };
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
/** 준결승 라운드 이름 — 2레그 여부 판정(고도화 항목33)에도 사용. */
export const CUP_SEMIFINAL_ROUND_NAME = '준결승';

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
  /** 이 대진에서 홈 구단이 시드 배정(상위 평판 포트) 쪽이었는지 — 추첨식 UI 표시용. */
  homeSeeded: boolean;
}

export interface NextCupRound {
  roundName: string;
  /** 홀수 인원 시 최상위 시드 부전승. */
  byeId: string | null;
  pairings: CupPairing[];
}

function shuffled<T>(arr: T[], rng: Rng): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * 다음 라운드 대진(순수 함수, 상태 변경 없음).
 * 관전 셋업을 위해 앱이 내 경기와 시드를 미리 알 수 있게 한다.
 *
 * 고도화 항목32: 실제 컵대회 추첨식처럼, 생존자를 평판 상위/하위 두 포트로
 * 나눠(상위 포트끼리 조기 격돌 방지) 각 포트 내부는 시드로 무작위 셔플한 뒤
 * 포트 간 1:1로 뽑는다. 기존엔 상위-하위를 순번대로 고정 매칭해 평판만 같으면
 * 매 시즌 대진표 모양이 완전히 동일했다.
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
  const half = m / 2;
  const seededPot = shuffled(arr.slice(0, half), new Rng(seedBase + 1));
  const unseededPot = shuffled(arr.slice(half), new Rng(seedBase + 2));
  const homeCoin = new Rng(seedBase + 3);

  const pairings: CupPairing[] = [];
  for (let i = 0; i < half; i++) {
    const seedTeam = seededPot[i]!;
    const otherTeam = unseededPot[i]!;
    const seedIsHome = homeCoin.roll(0.5);
    pairings.push({
      homeId: seedIsHome ? seedTeam : otherTeam,
      awayId: seedIsHome ? otherTeam : seedTeam,
      seed: seedBase + i,
      homeSeeded: seedIsHome,
    });
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
  const thisRoundName = roundName(survivors.length);
  const isFinal = thisRoundName === CUP_FINAL_ROUND_NAME;
  const isTwoLeg = !!cup.twoLegKnockout
    && (thisRoundName === CUP_FINAL_ROUND_NAME || thisRoundName === CUP_SEMIFINAL_ROUND_NAME);

  if (next.byeId) {
    ties.push({ homeId: next.byeId, awayId: null, homeScore: null, awayScore: null, penalties: false, winnerId: next.byeId });
  }

  next.pairings.forEach((pr, i) => {
    const home = byId.get(pr.homeId)!;
    const away = byId.get(pr.awayId)!;
    const homeTactic = tacticFor(home, away, true, isFinal, tactics);
    const awayTactic = tacticFor(away, home, false, isFinal, tactics);
    const leg1 =
      watched && watched.homeClubId === pr.homeId && watched.awayClubId === pr.awayId
        ? watched
        : simulateMatchWithAiTactics({
            home: { club: home, tactic: homeTactic },
            away: { club: away, tactic: awayTactic },
            seed: pr.seed,
            isBigMatch: isFinal,
          });
    applyMatchEffects(home, homeTactic, away, awayTactic, leg1,
      new Rng(seedBase * 2 + i + 7919));

    if (!isTwoLeg) {
      let winnerId: string;
      let penalties = false;
      if (leg1.score[0] > leg1.score[1]) winnerId = pr.homeId;
      else if (leg1.score[1] > leg1.score[0]) winnerId = pr.awayId;
      else {
        penalties = true;
        winnerId = new Rng(pr.seed + 500).roll(0.5) ? pr.homeId : pr.awayId;
      }
      ties.push({ homeId: pr.homeId, awayId: pr.awayId, homeScore: leg1.score[0], awayScore: leg1.score[1], penalties, winnerId });
      return;
    }

    // 2차전 — 원정팀(away)이 홈에서 개최(고도화 항목33). 전술은 개최지 기준으로 다시 산정.
    const leg2HomeTactic = tacticFor(away, home, true, isFinal, tactics);
    const leg2AwayTactic = tacticFor(home, away, false, isFinal, tactics);
    const leg2 = simulateMatchWithAiTactics({
      home: { club: away, tactic: leg2HomeTactic },
      away: { club: home, tactic: leg2AwayTactic },
      seed: pr.seed + 5_000_011,
      isBigMatch: isFinal,
    });
    applyMatchEffects(away, leg2HomeTactic, home, leg2AwayTactic, leg2,
      new Rng(seedBase * 2 + i + 7919 + 5_000_013));

    const secondLegHomeGoals = leg2.score[1]; // 원 홈팀이 2차전(원정)에서 넣은 골
    const secondLegAwayGoals = leg2.score[0]; // 원 원정팀이 2차전(홈)에서 넣은 골
    const { winnerId, penalties } = resolveTwoLegWinner(
      leg1.score[0], leg1.score[1], secondLegHomeGoals, secondLegAwayGoals,
      pr.homeId, pr.awayId, new Rng(pr.seed + 5_000_500),
    );
    ties.push({
      homeId: pr.homeId, awayId: pr.awayId, homeScore: leg1.score[0], awayScore: leg1.score[1],
      penalties, winnerId, secondLeg: { homeGoals: secondLegHomeGoals, awayGoals: secondLegAwayGoals },
    });
  });

  const rounds = [...cup.rounds, { name: roundName(survivors.length), ties }];
  const newSurvivors = ties.map((t) => t.winnerId);
  const championId = newSurvivors.length === 1 ? newSurvivors[0]! : null;
  return { ...cup, rounds, championId };
}

/** 2레그 타이의 합계 스코어(homeId/awayId 기준). 단판이면 null(고도화 항목33). */
export function cupTieAggregate(tie: CupTie): [number, number] | null {
  if (!tie.secondLeg || tie.homeScore === null || tie.awayScore === null) return null;
  return [tie.homeScore + tie.secondLeg.homeGoals, tie.awayScore + tie.secondLeg.awayGoals];
}

/**
 * 2레그 타이의 승자 판정(순수 함수, 고도화 항목33). 합계 득점 우선, 동률이면
 * 원정 다득점(홈팀은 2차전 원정 골, 원정팀은 1차전 원정 골) 우선, 그래도
 * 동률이면 승부차기(동전 던지기).
 */
export function resolveTwoLegWinner(
  leg1HomeGoals: number, leg1AwayGoals: number,
  leg2HomeGoals: number, leg2AwayGoals: number,
  homeId: string, awayId: string, penaltyRng: Rng,
): { winnerId: string; penalties: boolean } {
  const aggHome = leg1HomeGoals + leg2HomeGoals;
  const aggAway = leg1AwayGoals + leg2AwayGoals;
  if (aggHome > aggAway) return { winnerId: homeId, penalties: false };
  if (aggAway > aggHome) return { winnerId: awayId, penalties: false };

  const awayGoalsHome = leg2HomeGoals; // 홈팀이 원정(2차전)에서 넣은 골
  const awayGoalsAway = leg1AwayGoals; // 원정팀이 원정(1차전)에서 넣은 골
  if (awayGoalsHome > awayGoalsAway) return { winnerId: homeId, penalties: false };
  if (awayGoalsAway > awayGoalsHome) return { winnerId: awayId, penalties: false };

  return { winnerId: penaltyRng.roll(0.5) ? homeId : awayId, penalties: true };
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

/** 이변(자이언트 킬링, 신규 개선 항목 29)으로 칠 최소 평판 격차 — 승자가 패자보다
 *  이만큼(이상) 평판이 낮으면 이변으로 판정한다. */
export const CUP_UPSET_REP_GAP = 4;

export interface CupUpsetEvent {
  round: string;
  winnerId: string;
  winnerName: string;
  loserId: string;
  loserName: string;
  /** 패자 평판 − 승자 평판(양수, 클수록 더 큰 이변). */
  repGap: number;
}

/**
 * 컵대회 전 라운드를 훑어, 평판이 낮은 쪽이 이긴 이변 경기를 모두 찾는다.
 * 부전승(awayId===null)은 대상에서 제외된다.
 */
export function findCupUpsets(clubs: Club[], cup: CupState): CupUpsetEvent[] {
  const byId = new Map(clubs.map((c) => [c.id, c]));
  const out: CupUpsetEvent[] = [];
  for (const round of cup.rounds) {
    for (const tie of round.ties) {
      if (tie.awayId === null) continue;
      const loserId = tie.winnerId === tie.homeId ? tie.awayId : tie.homeId;
      const winner = byId.get(tie.winnerId);
      const loser = byId.get(loserId);
      if (!winner || !loser) continue;
      const repGap = loser.finance.reputation - winner.finance.reputation;
      if (repGap >= CUP_UPSET_REP_GAP) {
        out.push({
          round: round.name, winnerId: winner.id, winnerName: winner.name,
          loserId: loser.id, loserName: loser.name, repGap,
        });
      }
    }
  }
  return out;
}
