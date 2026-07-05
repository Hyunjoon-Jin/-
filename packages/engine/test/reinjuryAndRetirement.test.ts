import { describe, it, expect } from 'vitest';
import { generateClub, defaultTactic } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import { applyMatchEffects } from '../src/matchEffects.js';
import { playerDerived } from '../src/derived.js';
import { runOffseason } from '../src/franchise.js';
import { reinjuryRiskFactor, REINJURY_RISK_WINDOW, RECOVERY_ATTR_WINDOW } from '../src/injury.js';
import type { Club, MatchResult, Tactic } from '../src/types.js';

function emptyResult(overrides: Partial<MatchResult> = {}): MatchResult {
  return {
    homeClubId: 'h', awayClubId: 'a', homeClubName: 'H', awayClubName: 'A',
    score: [0, 0], possession: [50, 50], shots: [0, 0],
    events: [], cards: [], injuries: [],
    playerStats: { home: [], away: [] },
    seed: 1,
    ...overrides,
  };
}

function setup(seed = 1): { home: Club; away: Club; homeTactic: Tactic; awayTactic: Tactic } {
  const rng = new Rng(seed);
  const home = generateClub(rng, 'h', 'Home', 14);
  const away = generateClub(rng, 'a', 'Away', 12);
  return { home, away, homeTactic: defaultTactic(home), awayTactic: defaultTactic(away) };
}

describe('E04: 재부상 위험 구간', () => {
  it('reinjuryRiskFactor는 구간 시작 시점에 최대, 0경기 남으면 1.0', () => {
    expect(reinjuryRiskFactor(REINJURY_RISK_WINDOW)).toBeGreaterThan(1);
    expect(reinjuryRiskFactor(0)).toBe(1);
    expect(reinjuryRiskFactor(undefined)).toBe(1);
  });

  it('남은 경기 수가 줄어들수록 배율이 1.0으로 선형 감쇠한다', () => {
    const full = reinjuryRiskFactor(REINJURY_RISK_WINDOW);
    const half = reinjuryRiskFactor(REINJURY_RISK_WINDOW / 2);
    const none = reinjuryRiskFactor(0);
    expect(full).toBeGreaterThan(half);
    expect(half).toBeGreaterThan(none);
  });

  it('부상 복귀 시 재부상 위험 구간과 회복 지연 구간이 설정된다', () => {
    const { home, away, homeTactic, awayTactic } = setup(10);
    const p = home.players.find((pl) => homeTactic.lineup.some((s) => s.playerId === pl.id))!;
    p.injuryMatches = 1;
    applyMatchEffects(home, homeTactic, away, awayTactic, emptyResult(), new Rng(1));
    expect(p.injuryMatches).toBe(0);
    expect(p.reinjuryRiskMatches).toBe(REINJURY_RISK_WINDOW);
    expect(p.recoveryAttrMatches).toBe(RECOVERY_ATTR_WINDOW);
  });

  it('경기를 치를 때마다 재부상 위험 구간이 1씩 줄어든다', () => {
    const { home, away, homeTactic, awayTactic } = setup(11);
    const starterId = homeTactic.lineup[0]!.playerId;
    const p = home.players.find((pl) => pl.id === starterId)!;
    p.reinjuryRiskMatches = 3;
    p.recoveryAttrMatches = 2;
    applyMatchEffects(home, homeTactic, away, awayTactic, emptyResult(), new Rng(1));
    expect(p.reinjuryRiskMatches).toBe(2);
    expect(p.recoveryAttrMatches).toBe(1);
  });

  it('새 부상 발생 시 이전 재부상 위험·회복 지연 구간은 리셋된다', () => {
    const { home, away, homeTactic, awayTactic } = setup(12);
    const starterId = homeTactic.lineup[0]!.playerId;
    const p = home.players.find((pl) => pl.id === starterId)!;
    p.reinjuryRiskMatches = 3;
    p.recoveryAttrMatches = 2;
    const result = emptyResult({
      injuries: [{
        minute: 10, side: 'home', playerId: starterId, playerName: p.name,
        severity: 'moderate', name: '햄스트링 부상', bodyPart: 'hamstring', matches: 4,
      }],
    });
    applyMatchEffects(home, homeTactic, away, awayTactic, result, new Rng(1));
    expect(p.injuryMatches).toBe(4);
    expect(p.injuryBodyPart).toBe('hamstring');
    expect(p.reinjuryRiskMatches).toBe(0);
    expect(p.recoveryAttrMatches).toBe(0);
  });
});

describe('E05: 부상 후 능력치 회복 지연', () => {
  it('회복 지연 중인 부위 연관 능력치가 낮아진 상태로 파생 능력치에 반영된다', () => {
    const { home } = setup(20);
    const p = home.players.find((pl) => pl.position !== 'GK')!;
    const before = playerDerived(p, p.position);

    p.injuryBodyPart = 'hamstring';
    p.recoveryAttrMatches = RECOVERY_ATTR_WINDOW;
    const during = playerDerived(p, p.position);

    expect(during.physical).toBeLessThanOrEqual(before.physical);
  });

  it('회복 지연 구간이 끝나면(0) 페널티가 사라진다', () => {
    const { home } = setup(21);
    const p = home.players.find((pl) => pl.position !== 'GK')!;
    p.injuryBodyPart = 'hamstring';
    p.recoveryAttrMatches = 0;
    const noPenalty = playerDerived(p, p.position);

    p.recoveryAttrMatches = RECOVERY_ATTR_WINDOW;
    const withPenalty = playerDerived(p, p.position);

    expect(withPenalty.physical).toBeLessThan(noPenalty.physical);
  });

  it('부상 부위가 없으면(general) 페널티가 적용되지 않는다', () => {
    const { home } = setup(22);
    const p = home.players.find((pl) => pl.position !== 'GK')!;
    const before = playerDerived(p, p.position);
    p.injuryBodyPart = 'general';
    p.recoveryAttrMatches = RECOVERY_ATTR_WINDOW;
    const after = playerDerived(p, p.position);
    expect(after).toEqual(before);
  });

  it('경기를 치르며 회복 지연 구간이 소진되면 부상 부위 태그도 정리된다', () => {
    const { home, away, homeTactic, awayTactic } = setup(23);
    const starterId = homeTactic.lineup[0]!.playerId;
    const p = home.players.find((pl) => pl.id === starterId)!;
    p.injuryBodyPart = 'knee';
    p.reinjuryRiskMatches = 1;
    p.recoveryAttrMatches = 1;
    applyMatchEffects(home, homeTactic, away, awayTactic, emptyResult(), new Rng(1));
    expect(p.reinjuryRiskMatches).toBe(0);
    expect(p.recoveryAttrMatches).toBe(0);
    expect(p.injuryBodyPart).toBeUndefined();
  });
});

describe('E13: 확률적 은퇴', () => {
  it('33세 미만은 절대 은퇴하지 않는다', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rng = new Rng(seed);
      const club = generateClub(rng, 'c', 'C', 12);
      for (const p of club.players) p.age = 30;
      const result = runOffseason([club], new Rng(seed + 1000));
      expect(result.retiredPlayers).toHaveLength(0);
    }
  });

  it('42세 이상은 확률과 무관하게 항상 은퇴한다', () => {
    const rng = new Rng(1);
    const club = generateClub(rng, 'c', 'C', 12);
    const veteranId = club.players[0]!.id;
    club.players[0]!.age = 41; // 오프시즌 진행 후 42세
    club.players[0]!.attributes.naturalFitness = 20; // 자연회복력 최대여도 하드컷은 예외 없음
    const result = runOffseason([club], new Rng(2));
    expect(result.retiredPlayers.some((r) => r.playerId === veteranId)).toBe(true);
  });

  it('나이가 많을수록 은퇴 빈도가 높아진다(다수 시드 표본)', () => {
    function retireRate(age: number, trials: number): number {
      let retired = 0;
      for (let seed = 1; seed <= trials; seed++) {
        const rng = new Rng(seed * 7 + 1);
        const club = generateClub(rng, 'c', 'C', 12);
        const target = club.players[0]!;
        target.age = age;
        target.attributes.naturalFitness = 10;
        const before = club.players.length;
        const result = runOffseason([club], new Rng(seed * 13 + 2));
        if (result.retiredPlayers.some((r) => r.playerId === target.id)) retired++;
        void before;
      }
      return retired / trials;
    }
    const rate34 = retireRate(33, 120);
    const rate38 = retireRate(37, 120);
    expect(rate38).toBeGreaterThan(rate34);
  });

  it('자연회복력이 높을수록 같은 나이대에서 은퇴 확률이 낮아진다(다수 시드 표본)', () => {
    function retireRate(naturalFitness: number, trials: number): number {
      let retired = 0;
      for (let seed = 1; seed <= trials; seed++) {
        const rng = new Rng(seed * 11 + 3);
        const club = generateClub(rng, 'c', 'C', 12);
        const target = club.players[0]!;
        target.age = 36;
        target.attributes.naturalFitness = naturalFitness;
        const result = runOffseason([club], new Rng(seed * 17 + 4));
        if (result.retiredPlayers.some((r) => r.playerId === target.id)) retired++;
      }
      return retired / trials;
    }
    const lowFitness = retireRate(4, 150);
    const highFitness = retireRate(20, 150);
    expect(highFitness).toBeLessThan(lowFitness);
  });
});
