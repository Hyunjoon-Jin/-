import { describe, it, expect } from 'vitest';
import { applyMatchEffects } from '../src/matchEffects.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Club, MatchResult, Tactic } from '../src/types.js';

/**
 * 고도화 Item14: 부주장·완장 자동 승계.
 * 주장이 결장한 날 부주장이 라인업에 있으면 완장을 대신 차 팀 전체 사기 페널티가
 * 발생하지 않는다. 부주장을 지정하지 않은(undefined) 예전 세이브는 기존 페널티
 * 로직 그대로 동작해야 한다(하위 호환).
 */
function fakeResult(home: Club, away: Club, hg: number, ag: number): MatchResult {
  return {
    homeClubId: home.id, awayClubId: away.id,
    homeClubName: home.name, awayClubName: away.name,
    score: [hg, ag], possession: [50, 50], shots: [0, 0],
    events: [], cards: [], injuries: [], playerStats: { home: [], away: [] }, seed: 1,
  };
}

function setup(seed: number) {
  const rng = new Rng(seed);
  const home = generateClub(rng, 'h', 'Home', 13);
  const away = generateClub(rng, 'a', 'Away', 13);
  for (const c of [home, away]) for (const p of c.players) p.condition = 0.5;
  return { home, away, ht: defaultTactic(home), at: defaultTactic(away) };
}

describe('고도화 Item14: 부주장·완장 자동 승계', () => {
  it('주장이 결장해도 부주장이 라인업에 있으면 사기 페널티가 발생하지 않는다', () => {
    const withVc = setup(40);
    const withoutVc = setup(40);

    const captainId = withVc.ht.lineup[0]!.playerId;
    const viceCaptainId = withVc.ht.lineup[1]!.playerId;
    const benchPlayer = withVc.home.players.find((p) => !withVc.ht.lineup.some((s) => s.playerId === p.id))!;
    const brokenLineup = withVc.ht.lineup.map((s) => (
      s.playerId === captainId ? { ...s, playerId: benchPlayer.id } : s
    ));
    const tacticWithVc: Tactic = { ...withVc.ht, lineup: brokenLineup, captainId, viceCaptainId };
    const tacticWithoutVc: Tactic = { ...withoutVc.ht, lineup: brokenLineup, captainId, viceCaptainId: undefined };

    applyMatchEffects(withVc.home, tacticWithVc, withVc.away, withVc.at, fakeResult(withVc.home, withVc.away, 1, 1), new Rng(1));
    applyMatchEffects(withoutVc.home, tacticWithoutVc, withoutVc.away, withoutVc.at, fakeResult(withoutVc.home, withoutVc.away, 1, 1), new Rng(1));

    const untouchedId = withVc.ht.lineup.find((s) => s.playerId !== captainId && s.playerId !== viceCaptainId)!.playerId;
    const withVcMorale = withVc.home.players.find((p) => p.id === untouchedId)!.morale;
    const withoutVcMorale = withoutVc.home.players.find((p) => p.id === untouchedId)!.morale;
    expect(withVcMorale).toBeGreaterThan(withoutVcMorale);
  });

  it('부주장도 라인업에 없으면(둘 다 결장) 정상적으로 페널티가 발생한다', () => {
    const a = setup(41);
    const b = setup(41);
    const captainId = a.ht.lineup[0]!.playerId;
    const viceCaptainId = a.ht.lineup[1]!.playerId;
    const [bench1, bench2] = a.home.players.filter((p) => !a.ht.lineup.some((s) => s.playerId === p.id));
    const brokenLineup = a.ht.lineup.map((s) => {
      if (s.playerId === captainId) return { ...s, playerId: bench1!.id };
      if (s.playerId === viceCaptainId) return { ...s, playerId: bench2!.id };
      return s;
    });
    const tacticBothMissing: Tactic = { ...a.ht, lineup: brokenLineup, captainId, viceCaptainId };
    const tacticNormal: Tactic = { ...b.ht };

    applyMatchEffects(a.home, tacticBothMissing, a.away, a.at, fakeResult(a.home, a.away, 1, 1), new Rng(1));
    applyMatchEffects(b.home, tacticNormal, b.away, b.at, fakeResult(b.home, b.away, 1, 1), new Rng(1));

    const untouchedId = a.ht.lineup.find((s) => (
      s.playerId !== captainId && s.playerId !== viceCaptainId
    ))!.playerId;
    const withPenalty = a.home.players.find((p) => p.id === untouchedId)!.morale;
    const withoutPenalty = b.home.players.find((p) => p.id === untouchedId)!.morale;
    expect(withPenalty).toBeLessThan(withoutPenalty);
  });

  it('viceCaptainId를 지정하지 않은 예전 세이브는 기존 결장 페널티 로직과 동일하게 동작한다', () => {
    const a = setup(42);
    const b = setup(42);
    const captainId = a.ht.lineup[0]!.playerId;
    const benchPlayer = a.home.players.find((p) => !a.ht.lineup.some((s) => s.playerId === p.id))!;
    const brokenLineup = a.ht.lineup.map((s) => (s.playerId === captainId ? { ...s, playerId: benchPlayer.id } : s));
    const tacticNoVc: Tactic = { ...a.ht, lineup: brokenLineup, captainId, viceCaptainId: undefined };

    applyMatchEffects(a.home, tacticNoVc, a.away, a.at, fakeResult(a.home, a.away, 1, 1), new Rng(1));
    applyMatchEffects(b.home, b.ht, b.away, b.at, fakeResult(b.home, b.away, 1, 1), new Rng(1));

    const untouchedId = a.ht.lineup.find((s) => s.playerId !== captainId)!.playerId;
    const withPenalty = a.home.players.find((p) => p.id === untouchedId)!.morale;
    const withoutPenalty = b.home.players.find((p) => p.id === untouchedId)!.morale;
    expect(withPenalty).toBeLessThan(withoutPenalty);
  });
});
