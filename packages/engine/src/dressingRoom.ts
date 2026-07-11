/**
 * 드레싱룸(선수 심리) — P1: 행복도·출전시간 기대치·이적 요청 (docs/next-improvements.md A1·A2·A3·A8·A9).
 *
 * `morale`(경기력에 곱해지는 단기 사기)와 별개로, `happiness`(구단 만족도)는
 * 시즌에 걸쳐 천천히 누적되는 "이 구단에서 뛰는 게 만족스러운가"의 지표다.
 * 입력 요인은 4가지 — 출전시간(기대 지위 대비), 성적(승패), 연봉(능력 대비 대우),
 * 사기 — 이며 UI에서 각 요인이 노출되도록 `happinessFactors`가 분해값을 돌려준다
 * (설계 원칙2: 스칼라 남발 금지, "왜 오르내리는지"를 보여준다).
 *
 * 행복도가 임계 이하로 오래 지속되면 선수가 이적을 요청한다(A3). 모든 판정은
 * 순수 임계·시드 무관(RNG 미사용)이라 결정성·재현성을 유지한다.
 */
import type { Club, Player, SquadStatus } from './types.js';
import { clamp } from './math.js';
import { currentAbility } from './derived.js';
import { hasTrait } from './traits.js';

export type { SquadStatus };

// ── 지위(출전시간 기대치) ────────────────────────────────────

export const SQUAD_STATUS_LABEL: Record<SquadStatus, string> = {
  key: '핵심 선수',
  rotation: '로테이션',
  prospect: '유망주',
  fringe: '후보',
};

/** 각 지위가 한 시즌에 기대하는 선발 출전 비중(팀 경기수 대비). */
export const EXPECTED_SHARE: Record<SquadStatus, number> = {
  key: 0.7,
  rotation: 0.4,
  prospect: 0.2,
  fringe: 0.08,
};

/** 유망주로 취급하는 나이 상한(이 나이 이하는 출전 보장을 크게 기대하지 않는다). */
const PROSPECT_AGE = 20;
/** 상위 이 비율 안에 드는 능력치면 핵심 선수 기대(어린 특급도 이 안이면 핵심). */
const KEY_PCT = 0.3;
/** 여기까지는 로테이션 기대, 그 아래는 후보. */
const ROTATION_PCT = 0.65;

/**
 * 선수가 능력치 서열·나이로 **자연스럽게** 기대하는 지위(A2).
 * 감독이 별도로 약속(promise)한 지위가 있으면 effectiveStatus가 그쪽을 우선한다.
 */
export function expectedStatus(player: Player, squad: Player[]): SquadStatus {
  const own = currentAbility(player);
  // 자기보다 능력치가 높은(엄격히 큰) 선수 수 → 서열 백분위(0=최고, 1=최하).
  const better = squad.reduce((n, p) => (p.id !== player.id && currentAbility(p) > own ? n + 1 : n), 0);
  const denom = Math.max(1, squad.length - 1);
  const pct = better / denom;
  if (player.age <= PROSPECT_AGE) {
    // 어린 선수는 대개 출전보다 성장을 기대하지만, 스쿼드 최상위(특급 유망주)라면 주전을 기대한다.
    return pct <= 0.15 ? 'key' : 'prospect';
  }
  if (pct <= KEY_PCT) return 'key';
  if (pct <= ROTATION_PCT) return 'rotation';
  return 'fringe';
}

/** 감독이 약속한 지위(player.squadStatus)가 있으면 그것을, 없으면 자연 기대치를 쓴다. */
export function effectiveStatus(player: Player, squad: Player[]): SquadStatus {
  return player.squadStatus ?? expectedStatus(player, squad);
}

/** 지위 약속(A4의 토대) — 감독이 선수에게 특정 지위를 보장한다. */
export function promiseStatus(player: Player, status: SquadStatus): void {
  player.squadStatus = status;
}

// ── 행복도 ──────────────────────────────────────────────────

/** 행복도 중립값(신규/구세이브 선수 기본). */
export const NEUTRAL_HAPPINESS = 0.5;
/** 이 값 미만이면 "불만" 상태로 간주(이적요청 카운트 누적). */
export const HAPPINESS_UNHAPPY = 0.3;
/** 이적요청 후 이 값을 회복하면 요청을 스스로 철회한다. */
export const HAPPINESS_CONTENT = 0.55;
/** 불만이 이 경기 수만큼 연속되면 이적을 요청한다(A3). */
export const UNHAPPY_STREAK_LIMIT = 6;
/** 출전 비중 요인을 반영하기 전 필요한 최소 팀 경기수(시즌 초반 노이즈 방지). */
const MIN_MATCHES_FOR_PT = 5;

// 요인별 경기당 반영 가중치 — 시즌(약 38경기)에 걸쳐 완만히 누적되도록 작게 잡는다.
const PLAY_WEIGHT = 0.06; // 출전 비중 격차(±0.7) × 이 값 → 최대 ±0.042/경기
const RESULT_UP = 0.01; // 승리
const RESULT_DOWN = 0.012; // 패배(패배가 승리보다 체감이 크다)
const WAGE_WEIGHT = 0.012; // 연봉 만족(±1) × 이 값

/** 팀의 "치른 경기수" 근사 — 스쿼드에서 가장 많이 선발된 선수의 seasonApps.
 *  (상시 주전은 거의 전 경기를 뛰므로 좋은 프록시이자 자기정규화된다.) */
export function teamMatchesPlayed(squad: Player[]): number {
  return squad.reduce((m, p) => Math.max(m, p.seasonApps), 0);
}

/** 능력치 대비 대우(연봉) 만족도(−1~+1). 능력에 비해 후하게 받으면 +, 저평가면 −. */
function wageSatisfaction(player: Player, squad: Player[]): number {
  const n = squad.length;
  if (n <= 1) return 0;
  const own = currentAbility(player);
  const ownWage = player.wage;
  // 자기보다 능력/연봉이 높은 선수 수 → 각각의 백분위(1=최상위).
  let betterCA = 0;
  let higherWage = 0;
  for (const p of squad) {
    if (p.id === player.id) continue;
    if (currentAbility(p) > own) betterCA++;
    if (p.wage > ownWage) higherWage++;
  }
  const denom = n - 1;
  const caPct = 1 - betterCA / denom; // 능력 서열 백분위
  const wagePct = 1 - higherWage / denom; // 연봉 서열 백분위
  return clamp(wagePct - caPct, -1, 1); // 연봉이 능력보다 앞서면 만족(+)
}

/** 행복도 요인 분해(UI 노출용) — 왜 오르내리는지를 설명한다(설계 원칙2). */
export interface HappinessFactors {
  happiness: number;
  status: SquadStatus;
  /** 감독이 약속한 지위인지(true면 자연 기대치가 아니라 약속 기준). */
  promised: boolean;
  expectedShare: number;
  actualShare: number;
  teamMatches: number;
  /** 출전시간 요인의 방향(+면 기대 이상, −면 기대 미달). 팀 경기수 부족 시 0. */
  playingTime: number;
  /** 연봉 대우 만족도(−1~+1). */
  wage: number;
  /** 이적 요청 상태. */
  transferRequested: boolean;
  /** 이적요청까지 남은 불만 경기 수(0이면 이미 요청했거나 다음 불만 경기에 요청). */
  unhappyStreak: number;
}

/** 선수의 현재 행복도 요인을 계산(변형 없음) — PlayerDetail 등에서 호출. */
export function happinessFactors(player: Player, squad: Player[]): HappinessFactors {
  const status = effectiveStatus(player, squad);
  const teamMatches = teamMatchesPlayed(squad);
  const expShare = EXPECTED_SHARE[status];
  const actualShare = teamMatches > 0 ? clamp(player.seasonApps / teamMatches, 0, 1) : expShare;
  const playingTime = teamMatches >= MIN_MATCHES_FOR_PT
    ? clamp(actualShare - expShare, -0.7, 0.7)
    : 0;
  return {
    happiness: player.happiness ?? NEUTRAL_HAPPINESS,
    status,
    promised: player.squadStatus !== undefined,
    expectedShare: expShare,
    actualShare,
    teamMatches,
    playingTime,
    wage: wageSatisfaction(player, squad),
    transferRequested: player.transferRequested ?? false,
    unhappyStreak: player.unhappyStreak ?? 0,
  };
}

/**
 * 한 경기 결과를 구단 선수들의 행복도에 반영(A1) 하고, 지속적 불만이면 이적을 요청(A3).
 * matchEffects에서 seasonApps가 갱신된 **뒤** 호출돼야 출전 비중이 정확하다.
 * @param outcome 이 구단 기준 이번 경기 결과.
 */
export function applyDressingRoomEffects(club: Club, outcome: 'W' | 'D' | 'L'): void {
  const squad = club.players;
  const teamMatches = teamMatchesPlayed(squad);
  const resultDelta = outcome === 'W' ? RESULT_UP : outcome === 'L' ? -RESULT_DOWN : 0;
  for (const player of squad) {
    const status = effectiveStatus(player, squad);
    const expShare = EXPECTED_SHARE[status];
    let delta = resultDelta + wageSatisfaction(player, squad) * WAGE_WEIGHT;
    if (teamMatches >= MIN_MATCHES_FOR_PT) {
      const actualShare = clamp(player.seasonApps / teamMatches, 0, 1);
      delta += clamp(actualShare - expShare, -0.7, 0.7) * PLAY_WEIGHT;
    }
    const before = player.happiness ?? NEUTRAL_HAPPINESS;
    const happiness = clamp(before + delta, 0, 1);
    player.happiness = happiness;

    // 이적 요청 판정(A3) — 임대 온 선수는 이 구단 소속이 아니므로 제외.
    if (player.loanFromClubId !== undefined) continue;
    if (happiness < HAPPINESS_UNHAPPY) {
      const streak = (player.unhappyStreak ?? 0) + 1;
      player.unhappyStreak = streak;
      if (streak >= UNHAPPY_STREAK_LIMIT) player.transferRequested = true;
    } else {
      player.unhappyStreak = Math.max(0, (player.unhappyStreak ?? 0) - 1);
      // 충분히 회복하면 스스로 요청을 거둔다.
      if (happiness > HAPPINESS_CONTENT && player.transferRequested) {
        player.transferRequested = false;
      }
    }
  }
}

// ── 감독 개입(A8 팀 미팅 · A9 개인 면담) ────────────────────

export type TeamMeetingTone = 'encourage' | 'demand' | 'unite';

/**
 * 팀 미팅(A8) — 감독이 스쿼드 전체 사기를 단기 보정한다. 목표치로 끌어당기는 방식이라
 * 사기가 이미 높으면 효과가 작다(남용 시 효과 감소, 설계 반영). 결정성 유지(RNG 미사용).
 * @returns 평균 사기 변화량(UI 피드백용).
 */
export function holdTeamMeeting(club: Club, tone: TeamMeetingTone): number {
  // 격려: 낮은 사기를 끌어올린다. 단합: 완만한 상향. 질책: 부진한 선수엔 자극이 되지만
  // 이미 사기 높은 선수는 오히려 소폭 하락(과한 질책의 역효과).
  let sum = 0;
  for (const p of club.players) {
    const m = p.morale;
    let target: number;
    let pull: number;
    if (tone === 'encourage') { target = 0.68; pull = 0.3; }
    else if (tone === 'unite') { target = 0.6; pull = 0.2; }
    else { target = m < 0.45 ? 0.6 : 0.42; pull = 0.35; } // demand
    const next = clamp(m + (target - m) * pull, 0, 1);
    sum += next - m;
    p.morale = next;
  }
  return club.players.length ? sum / club.players.length : 0;
}

export type IndividualTalkKind = 'praise' | 'warn';

/**
 * 개인 면담(A9) — 특정 선수에게 칭찬/경고. 칭찬은 행복도·사기를 올리고, 경고는
 * 단기 사기를 자극하되 행복도는 소폭 낮춘다(압박의 대가). 결정성 유지.
 */
export function individualTalk(player: Player, kind: IndividualTalkKind): void {
  const happy = player.happiness ?? NEUTRAL_HAPPINESS;
  if (kind === 'praise') {
    player.happiness = clamp(happy + 0.06, 0, 1);
    player.morale = clamp(player.morale + 0.04, 0, 1);
  } else {
    // 리더십 있는 선수는 경고를 프로답게 받아들여 역효과가 적다.
    const backlash = hasTrait(player, 'leader') ? 0.01 : 0.03;
    player.happiness = clamp(happy - backlash, 0, 1);
    player.morale = clamp(player.morale + 0.03, 0, 1);
  }
}

// ── 이적 요청 해소(감독 액션) ────────────────────────────────

/**
 * 이적 요청 설득(A3) — 감독이 선수를 달랜다. 요청을 철회시키고 불만 카운트를 리셋하되,
 * 행복도 자체는 소폭만 오른다(근본 원인이 그대로면 다시 쌓일 수 있다).
 */
export function persuadeToStay(player: Player): void {
  player.transferRequested = false;
  player.unhappyStreak = 0;
  player.happiness = clamp((player.happiness ?? NEUTRAL_HAPPINESS) + 0.12, 0, 1);
}

/** 이적 요청 거부(A3) — 요청만 무시한다. 불만은 그대로라 곧 다시 요청할 수 있다. */
export function rejectTransferRequest(player: Player): void {
  player.transferRequested = false;
  // 불만 카운트는 유지하지 않고 한 박자 늦추기만 한다(임계 직전으로 되돌림).
  player.unhappyStreak = UNHAPPY_STREAK_LIMIT - 1;
}

/** 시즌 경계 처리 — seasonApps가 리셋되므로 출전시간 불만 카운트도 리셋(새 시즌 새 출발). */
export function resetDressingRoomForNewSeason(player: Player): void {
  player.unhappyStreak = 0;
}
