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

/** 차출 기준: 국적별 상위 squadSize명, 단 최소 능력(minCA) 이상만. */
export function selectCallUps(clubs: Club[], squadSize = 23, minCA = 148): Player[] {
  const byNation = new Map<string, { p: Player }[]>();
  for (const club of clubs) {
    for (const p of club.players) {
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
