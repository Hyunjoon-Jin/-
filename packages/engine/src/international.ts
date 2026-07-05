/**
 * 국가대표 차출(A매치) — 장기 시뮬 심화.
 * 시즌 사이 국제 대회에 국적별 최상위 선수가 차출된다.
 * 차출은 A매치 캡·사기(국가대표 자부심)를 주지만, 국제 경기 피로로
 * 다음 시즌을 낮은 컨디션으로 시작하고 일부는 부상을 안고 온다.
 *
 * 오프시즌(runOffseason) 이후에 호출해야 한다 — 컨디션 리셋을 덮어써야
 * 차출 피로가 새 시즌 시작에 반영되기 때문.
 */
import type { Club, Player } from './types.js';
import type { Rng } from './rng.js';
import { currentAbility } from './derived.js';
import { clamp } from './math.js';
import { defaultTactic } from './generate.js';
import { simulateMatchWithAiTactics } from './aiInMatch.js';

export interface CallUp {
  clubId: string;
  playerId: string;
  name: string;
  nationality: string;
}

export interface InternationalResult {
  callUps: CallUp[];
  /** 차출 중 부상당한 인원. */
  injuries: number;
  /** clubId → 차출 인원. */
  byClub: Map<string, number>;
}

/** 차출 기준: 국적별 상위 squadSize명, 단 최소 능력(minCA) 이상만(국가대표 은퇴 선언자는 제외, 신규 개선 항목 19). */
export function selectCallUps(clubs: Club[], squadSize = 23, minCA = 148): Player[] {
  const byNation = new Map<string, { p: Player }[]>();
  for (const club of clubs) {
    for (const p of club.players) {
      if (p.internationalRetired) continue;
      if (currentAbility(p) < minCA) continue;
      const arr = byNation.get(p.nationality);
      if (arr) arr.push({ p });
      else byNation.set(p.nationality, [{ p }]);
    }
  }
  const out: Player[] = [];
  for (const arr of byNation.values()) {
    arr.sort((a, b) => currentAbility(b.p) - currentAbility(a.p));
    for (const { p } of arr.slice(0, squadSize)) out.push(p);
  }
  return out;
}

/**
 * 국가대표 차출 이벤트를 적용한다(오프시즌 리셋 이후).
 * @param rng 시드 고정 난수(부상 판정용).
 */
export function runInternationalBreak(clubs: Club[], rng: Rng): InternationalResult {
  const clubOf = new Map<string, string>();
  for (const club of clubs) for (const p of club.players) clubOf.set(p.id, club.id);

  const called = selectCallUps(clubs);
  const callUps: CallUp[] = [];
  const byClub = new Map<string, number>();
  let injuries = 0;

  for (const p of called) {
    p.caps += 1;
    p.morale = clamp(p.morale + 0.04, 0, 1);      // 국가대표 자부심
    p.condition = Math.min(p.condition, 0.9);     // 국제 경기 피로

    // 부상 위험(자연회복이 높을수록↓).
    const injP = clamp(0.08 - (p.attributes.naturalFitness - 10) * 0.004, 0.02, 0.12);
    if (rng.roll(injP)) {
      p.injuryMatches = rng.int(1, 3);
      p.injuryName = '대표팀 차출 중 부상';
      p.condition = 0.6;
      injuries++;
    }

    const clubId = clubOf.get(p.id)!;
    callUps.push({ clubId, playerId: p.id, name: p.name, nationality: p.nationality });
    byClub.set(clubId, (byClub.get(clubId) ?? 0) + 1);
  }

  return { callUps, injuries, byClub };
}

// ── 국가대표 은퇴(신규 개선 항목 19) ─────────────────────────

/** 이 나이부터 확률적으로 국가대표 은퇴를 고려한다(선수 은퇴보다 훨씬 이른 나이 — 실제로
 *  구단 커리어에 집중하려 A매치를 먼저 그만두는 경우가 많다). */
export const INTL_RETIRE_MIN_AGE = 32;
/** 이만큼 캡을 쌓은 "기존 국가대표"만 은퇴를 선언한다(무명 선수는 그냥 차출 대상에서
 *  자연히 밀려날 뿐 별도 이벤트가 필요 없다). */
export const INTL_RETIRE_MIN_CAPS = 20;

/** 나이·캡에 따른 국가대표 은퇴 선언 확률(32세=5%, 36세=25%, 39세=40% 기준, 상한 있음). */
export function internationalRetireChance(age: number, caps: number): number {
  if (age < INTL_RETIRE_MIN_AGE || caps < INTL_RETIRE_MIN_CAPS) return 0;
  return clamp((age - INTL_RETIRE_MIN_AGE + 1) * 0.05, 0, 0.6);
}

export interface InternationalRetirementEvent {
  playerId: string;
  name: string;
  clubId: string;
  clubName: string;
  caps: number;
}

/**
 * 오프시즌 경계에 고령·다수 캡 선수의 국가대표 은퇴 여부를 판정한다(runInternationalBreak/
 * runInternationalTournament보다 먼저 호출해야 이번 시즌 차출 명단에 즉시 반영된다).
 * 은퇴해도 클럽 경기력에는 영향이 없다 — 이후 A매치 차출 대상에서만 영구 제외될 뿐이다.
 */
export function checkInternationalRetirements(clubs: Club[], rng: Rng): InternationalRetirementEvent[] {
  const events: InternationalRetirementEvent[] = [];
  for (const club of clubs) {
    for (const p of club.players) {
      if (p.internationalRetired) continue;
      if (!rng.roll(internationalRetireChance(p.age, p.caps))) continue;
      p.internationalRetired = true;
      events.push({ playerId: p.id, name: p.name, clubId: club.id, clubName: club.name, caps: p.caps });
    }
  }
  return events;
}

// ── 비정기 국제대회(C15, 월드컵/유로급) ─────────────────────

/** 국가대표팀 소집 인원(리그의 클럽 스쿼드보다 작게 — 각국 최상위 자원만). */
const TOURNAMENT_SQUAD_SIZE = 18;
/** 대회 소집 최소 능력(CA) 기준 — 정기 A매치 소집(minCA=148)보다 낮춰 더 많은 국가가 참가 가능하게 한다. */
const TOURNAMENT_MIN_CA = 120;
/** 이 인원 미만이면(포메이션 구성 불가) 해당 국적은 이번 대회에 참가하지 못한다. */
const MIN_NATIONAL_SQUAD = 14;
/** 권장 개최 주기(시즌) — 실제 소집 여부는 호출부(앱)가 시즌 번호로 판단한다. */
export const TOURNAMENT_INTERVAL_SEASONS = 4;

export interface TournamentTie {
  homeNation: string;
  awayNation: string;
  homeScore: number;
  awayScore: number;
  penalties: boolean;
  winnerNation: string;
}

export interface TournamentRound {
  name: string;
  ties: TournamentTie[];
}

export interface InternationalTournamentResult {
  /** 대회 우승 국가. 참가 자격을 갖춘 국가가 2개 미만이면 대회 자체가 열리지 않아 null. */
  championNation: string | null;
  rounds: TournamentRound[];
  /** 참가 선수(국적별) — 정기 차출과 같은 형식으로 앱에 노출. */
  callUps: CallUp[];
  /** 대회 중 부상당한 인원. */
  injuries: number;
  /** clubId → 이번 대회 차출 인원. */
  byClub: Map<string, number>;
}

/** 결승까지 남은 라운드 수 기준 이름 — cup.ts의 규칙과 동일한 관례를 국가대표 대회에도 적용. */
function tournamentRoundName(survivors: number): string {
  const roundsToFinal = Math.ceil(Math.log2(Math.max(2, survivors)));
  if (roundsToFinal <= 1) return '결승';
  if (roundsToFinal === 2) return '준결승';
  if (roundsToFinal === 3) return '8강';
  if (roundsToFinal === 4) return '16강';
  return '예선';
}

/** 가상 국가대표팀을 simulateMatch가 받아들이는 Club 형태로 감싼다(재정/스태프는 미사용 더미). */
function buildNationalTeam(nationality: string, players: Player[]): Club {
  return {
    id: `nation:${nationality}`,
    name: nationality,
    players,
    finance: { balance: 0, transferBudget: 0, reputation: 10 },
    staff: { coaching: 12, medical: 12, scouting: 10, youth: 10 },
    division: 0,
  };
}

/** 국적별 참가 자격 선수 풀(대회 소집 인원만큼, 능력순). 유효 인원 미달 국가는 제외
 *  (국가대표 은퇴 선언자는 제외, 신규 개선 항목 19). */
function nationalPools(clubs: Club[]): Map<string, Player[]> {
  const byNation = new Map<string, Player[]>();
  for (const club of clubs) {
    for (const p of club.players) {
      if (p.internationalRetired) continue;
      if (currentAbility(p) < TOURNAMENT_MIN_CA) continue;
      const arr = byNation.get(p.nationality);
      if (arr) arr.push(p); else byNation.set(p.nationality, [p]);
    }
  }
  const out = new Map<string, Player[]>();
  for (const [nation, arr] of byNation) {
    if (arr.length < MIN_NATIONAL_SQUAD) continue;
    arr.sort((a, b) => currentAbility(b) - currentAbility(a));
    out.set(nation, arr.slice(0, TOURNAMENT_SQUAD_SIZE));
  }
  return out;
}

/**
 * 비정기 국제대회(월드컵/유로급) — 자격을 갖춘 국적이 가상 국가대표팀을 구성해
 * 단판 토너먼트를 치른다. 클럽 시즌 기록(seasonApps/seasonGoals/suspensionMatches)을
 * 오염시키지 않도록 applyMatchEffects는 재사용하지 않고, 대회 전용으로 캡·사기·
 * 컨디션·부상만 직접 반영한다(진행한 라운드 수에 비례 — 오래 남을수록 효과가 크다).
 */
export function runInternationalTournament(clubs: Club[], rng: Rng): InternationalTournamentResult {
  const pools = nationalPools(clubs);
  const nations = [...pools.keys()];
  if (nations.length < 2) {
    return { championNation: null, rounds: [], callUps: [], injuries: 0, byClub: new Map() };
  }

  const avgCA = (nation: string): number => {
    const ps = pools.get(nation)!;
    return ps.reduce((s, p) => s + currentAbility(p), 0) / ps.length;
  };
  let survivors = [...nations].sort((a, b) => avgCA(b) - avgCA(a));
  const roundsPlayed = new Map<string, number>(nations.map((n) => [n, 0]));
  const rounds: TournamentRound[] = [];
  let seedCounter = 0;
  let guard = 10; // 무한루프 방지(참가국 수가 비정상적으로 많아도 안전)

  while (survivors.length > 1 && guard-- > 0) {
    let arr = survivors;
    let byeNation: string | null = null;
    if (arr.length % 2 === 1) { byeNation = arr[0]!; arr = arr.slice(1); }

    const ties: TournamentTie[] = [];
    const nextSurvivors: string[] = byeNation ? [byeNation] : [];

    const m = arr.length;
    for (let i = 0; i < m / 2; i++) {
      const homeNation = arr[i]!;
      const awayNation = arr[m - 1 - i]!;
      const home = buildNationalTeam(homeNation, pools.get(homeNation)!);
      const away = buildNationalTeam(awayNation, pools.get(awayNation)!);
      const seed = rng.int(1, 1_000_000_000) + seedCounter++;
      const result = simulateMatchWithAiTactics({
        home: { club: home, tactic: defaultTactic(home, { opponent: away, isHome: true, isBigMatch: true }) },
        away: { club: away, tactic: defaultTactic(away, { opponent: home, isHome: false, isBigMatch: true }) },
        seed,
      });

      let winnerNation: string;
      let penalties = false;
      if (result.score[0] > result.score[1]) winnerNation = homeNation;
      else if (result.score[1] > result.score[0]) winnerNation = awayNation;
      else { penalties = true; winnerNation = rng.roll(0.5) ? homeNation : awayNation; }

      ties.push({ homeNation, awayNation, homeScore: result.score[0], awayScore: result.score[1], penalties, winnerNation });
      nextSurvivors.push(winnerNation);
      roundsPlayed.set(homeNation, (roundsPlayed.get(homeNation) ?? 0) + 1);
      roundsPlayed.set(awayNation, (roundsPlayed.get(awayNation) ?? 0) + 1);
    }

    rounds.push({ name: tournamentRoundName(survivors.length), ties });
    survivors = nextSurvivors;
  }

  const championNation = survivors[0] ?? null;

  const callUps: CallUp[] = [];
  const byClub = new Map<string, number>();
  const clubOf = new Map<string, string>();
  for (const club of clubs) for (const p of club.players) clubOf.set(p.id, club.id);
  let injuries = 0;

  for (const nation of nations) {
    const games = roundsPlayed.get(nation) ?? 0;
    const isChampion = nation === championNation;
    for (const p of pools.get(nation)!) {
      p.caps += Math.max(1, games); // 소집 자체로 최소 1캡, 실전 출전만큼 가산
      p.morale = clamp(p.morale + 0.06 + games * 0.015 + (isChampion ? 0.08 : 0), 0, 1);
      p.condition = clamp(0.85 - games * 0.06, 0.45, 0.9);
      // 부상 위험 — 치른 경기 수만큼 반복 판정(자연회복 높을수록 낮음). 대회당 최대 1건만 집계.
      for (let g = 0; g < games; g++) {
        const injP = clamp(0.05 - (p.attributes.naturalFitness - 10) * 0.002, 0.015, 0.08);
        if (rng.roll(injP)) {
          p.injuryMatches = Math.max(p.injuryMatches, rng.int(1, 4));
          p.injuryName = '국제대회 중 부상';
          p.condition = Math.min(p.condition, 0.55);
          injuries++;
          break;
        }
      }
      const clubId = clubOf.get(p.id)!;
      callUps.push({ clubId, playerId: p.id, name: p.name, nationality: p.nationality });
      byClub.set(clubId, (byClub.get(clubId) ?? 0) + 1);
    }
  }

  return { championNation, rounds, callUps, injuries, byClub };
}
