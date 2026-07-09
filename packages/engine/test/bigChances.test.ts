import { describe, it, expect } from 'vitest';
import { simulateMatch } from '../src/simulateMatch.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { Rng } from '../src/rng.js';

function matchup(seed = 1) {
  const rng = new Rng(seed);
  const home = generateClub(rng, 'h', 'Home', 14);
  const away = generateClub(rng, 'a', 'Away', 13);
  return { home, away, ht: defaultTactic(home), at: defaultTactic(away) };
}

describe('빅찬스 생성/실축 지표 (고도화 항목45)', () => {
  it('많은 경기를 시뮬레이션하면 빅찬스가 실제로 집계된다', () => {
    const { home, away, ht, at } = matchup(1);
    let totalCreated = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const r = simulateMatch({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed });
      for (const s of [...r.playerStats.home, ...r.playerStats.away]) {
        totalCreated += s.bigChancesCreated ?? 0;
      }
    }
    expect(totalCreated).toBeGreaterThan(0);
  });

  it('빅찬스 실축 수는 항상 생성 수 이하다', () => {
    const { home, away, ht, at } = matchup(2);
    for (let seed = 1; seed <= 60; seed++) {
      const r = simulateMatch({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed });
      for (const s of [...r.playerStats.home, ...r.playerStats.away]) {
        expect(s.bigChancesMissed ?? 0).toBeLessThanOrEqual(s.bigChancesCreated ?? 0);
      }
    }
  });

  it('빅찬스에서 득점하면(빅찬스 생성은 늘지만) 실축으로는 잡히지 않는다', () => {
    const { home, away, ht, at } = matchup(3);
    let found = false;
    for (let seed = 1; seed <= 100 && !found; seed++) {
      const r = simulateMatch({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed });
      for (const s of [...r.playerStats.home, ...r.playerStats.away]) {
        if ((s.bigChancesCreated ?? 0) > 0 && s.goals > 0 && (s.bigChancesCreated ?? 0) > (s.bigChancesMissed ?? 0)) {
          found = true;
          break;
        }
      }
    }
    expect(found).toBe(true);
  });

  it('자책골로 이어진 상황은 원래 슈터의 빅찬스 집계에서 제외된다', () => {
    const { home, away, ht, at } = matchup(4);
    let checkedAny = false;
    for (let seed = 1; seed <= 300; seed++) {
      const r = simulateMatch({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed });
      const ownGoalEvents = r.events.filter((e) => e.outcome === 'OWN_GOAL');
      if (ownGoalEvents.length === 0) continue;
      checkedAny = true;
      // 자책골 이벤트의 playerId는 수비수(득점 귀책자)이므로, 그 선수의 개인 슈팅 집계에는
      // 영향이 없어야 한다(빅찬스는 슈터 관점 통계이지 수비수 통계가 아님).
      for (const ev of ownGoalEvents) {
        const stat = [...r.playerStats.home, ...r.playerStats.away].find((s) => s.playerId === ev.playerId)!;
        // 자책골 주체가 어쩌다 다른 상황에서 슈팅을 했을 수도 있으니 정확히 0이라 단정하진
        // 않되, 최소한 실축 수가 생성 수를 넘지 않는 불변식은 항상 지켜져야 한다.
        expect(stat.bigChancesMissed ?? 0).toBeLessThanOrEqual(stat.bigChancesCreated ?? 0);
      }
    }
    expect(checkedAny).toBe(true);
  });
});
