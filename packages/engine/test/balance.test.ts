import { describe, it, expect } from 'vitest';
import { runBalanceSimulation } from '../src/balanceSim.js';

/**
 * 밸런스 회귀 검증(Track 9) — 그동안 packages/engine/src/balance.ts를 손으로 실행해
 * 리포트 숫자를 눈으로 확인해 왔다. 전술·성장·세트피스 등 시뮬레이션에 영향을 주는
 * 변경마다 사람이 매번 판단해야 했던 것을, 여기서는 실제로 관측된 정상 범위를
 * 문서화된 임계값으로 굳혀 npm test 한 번으로 자동 검증한다.
 * CLI 리포트(balance.ts)와 같은 시드/팀 수/시즌 수를 써서 서로의 결과를 대조할 수 있다.
 */
const SEED = 20260701;
const N = 12;
const SEASONS = 15;

const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;

describe('밸런스 회귀: 12팀 × 15시즌 헤드리스 시뮬레이션', () => {
  const r = runBalanceSimulation(SEED, N, SEASONS);

  it('경기당 평균 득점이 정상 범위(2.2~3.3)에 있다', () => {
    expect(avg(r.goalsPerMatch)).toBeGreaterThan(2.2);
    expect(avg(r.goalsPerMatch)).toBeLessThan(3.3);
  });

  it('현재전력(CA)↔최종순위 상관이 충분히 강하다(스쿼드 강한 팀이 실제로 상위권에 든다)', () => {
    expect(avg(r.caCorr)).toBeGreaterThan(0.55);
  });

  it('우승 구단이 지나치게 획일화되지 않는다(15시즌 동안 최소 2개 이상 구단이 우승)', () => {
    expect(new Set(r.champions).size).toBeGreaterThanOrEqual(2);
  });

  it('구단 재정이 영구 파산하지 않는다(고도화 항목21: FFP 경고→제재→강제매각 단계 때문에 ' +
    '최하위 구단이 최대 2시즌은 적자를 버틸 수 있지만, 그 이상 방치되지는 않는다)', () => {
    expect(r.negativeSeasons).toBeLessThanOrEqual(5);
  });

  it('스쿼드 크기가 규정 범위(14~26명) 안에서 유지된다', () => {
    expect(r.minSquad).toBeGreaterThanOrEqual(14);
    expect(r.maxSquad).toBeLessThanOrEqual(26);
  });

  it('시즌당 은퇴 인원이 합리적 범위(0.5~15명)에 있다(고사·폭증 둘 다 이상 신호)', () => {
    const avgRetirements = avg(r.retirementsPerSeason);
    expect(avgRetirements).toBeGreaterThan(0.5);
    expect(avgRetirements).toBeLessThan(15);
  });

  it('최종 시즌 최상위 팀이 최하위 팀보다 확실히 강하다(전력 격차가 붕괴되지 않는다)', () => {
    const spread = r.finalTop11CAs[0]! - r.finalTop11CAs[r.finalTop11CAs.length - 1]!;
    expect(spread).toBeGreaterThan(20);
  });

  it('동일 시드로 다시 돌리면 완전히 같은 결과가 나온다(재현성)', () => {
    const r2 = runBalanceSimulation(SEED, N, SEASONS);
    expect(r2.champions).toEqual(r.champions);
    expect(r2.goalsPerMatch).toEqual(r.goalsPerMatch);
  });
});
