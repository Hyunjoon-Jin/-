import { describe, it, expect } from 'vitest';
import { MatchMotion, type MotionInput, type Vec } from '../src/matchMotion.js';

/** 4-4-2 대략 앵커(홈 기준, 실제 좌표). 원정은 미러링. */
function anchors(): { home: Vec[]; away: Vec[]; homeGK: boolean[]; awayGK: boolean[] } {
  const home: Vec[] = [
    { x: 0.05, y: 0.5 }, // GK
    { x: 0.2, y: 0.2 }, { x: 0.2, y: 0.4 }, { x: 0.2, y: 0.6 }, { x: 0.2, y: 0.8 },
    { x: 0.45, y: 0.2 }, { x: 0.45, y: 0.4 }, { x: 0.45, y: 0.6 }, { x: 0.45, y: 0.8 },
    { x: 0.7, y: 0.4 }, { x: 0.7, y: 0.6 },
  ];
  const away: Vec[] = home.map((a) => ({ x: 1 - a.x, y: a.y }));
  const homeGK = home.map((_, i) => i === 0);
  const awayGK = away.map((_, i) => i === 0);
  return { home, away, homeGK, awayGK };
}

function baseInput(ballZone: Vec, possession: 'home' | 'away' = 'home'): MotionInput {
  const a = anchors();
  return {
    homeAnchors: a.home, awayAnchors: a.away, homeIsGK: a.homeGK, awayIsGK: a.awayGK,
    ballZone, possession,
  };
}

function run(m: MatchMotion, seconds: number, dt = 1 / 60): void {
  for (let t = 0; t < seconds; t += dt) m.step(dt);
}

describe('MatchMotion — 관전 운동 모델', () => {
  it('여러 초를 진행해도 모든 선수·공이 피치 경계 안에 머문다', () => {
    const m = new MatchMotion();
    m.setInput(baseInput({ x: 0.9, y: 0.1 }));
    for (let i = 0; i < 600; i++) {
      m.setInput(baseInput({ x: Math.abs(Math.sin(i / 7)), y: Math.abs(Math.cos(i / 5)) }, i % 2 ? 'away' : 'home'));
      m.step(1 / 60);
    }
    for (const p of m.players) {
      expect(p.pos.x).toBeGreaterThanOrEqual(0.02);
      expect(p.pos.x).toBeLessThanOrEqual(0.98);
      expect(p.pos.y).toBeGreaterThanOrEqual(0.04);
      expect(p.pos.y).toBeLessThanOrEqual(0.96);
    }
    expect(m.ball.pos.x).toBeGreaterThanOrEqual(0.02);
    expect(m.ball.pos.x).toBeLessThanOrEqual(0.98);
  });

  it('공이 중앙에 오래 머물면 선수들은 대체로 자기 앵커 근처의 형태를 유지한다', () => {
    const m = new MatchMotion();
    const input = baseInput({ x: 0.5, y: 0.5 });
    m.setInput(input);
    run(m, 6);
    // 공 근처(중앙)로 끌려간 몇 명을 빼면, 대다수는 앵커에서 멀지 않아야 한다.
    const near = m.players.filter((p) => Math.hypot(p.pos.x - p.anchor.x, p.pos.y - p.anchor.y) < 0.14);
    expect(near.length).toBeGreaterThanOrEqual(16); // 22명 중 다수가 형태 유지
  });

  it('공에 가장 가까운 선수는 시간이 지나면 앵커보다 공에 더 가까이 붙는다(압박)', () => {
    const m = new MatchMotion();
    const zone = { x: 0.5, y: 0.5 };
    m.setInput(baseInput(zone));
    // 앵커 기준 공에서 가장 가까운 필드플레이어를 고른다.
    const initialNearest = m.players
      .filter((p) => !p.isGK)
      .reduce((a, b) => (Math.hypot(a.anchor.x - zone.x, a.anchor.y - zone.y)
        < Math.hypot(b.anchor.x - zone.x, b.anchor.y - zone.y) ? a : b));
    const anchorDist = Math.hypot(initialNearest.anchor.x - zone.x, initialNearest.anchor.y - zone.y);
    run(m, 5);
    const posDist = Math.hypot(initialNearest.pos.x - m.ball.pos.x, initialNearest.pos.y - m.ball.pos.y);
    expect(posDist).toBeLessThan(anchorDist);
  });

  it('공은 항상 어떤 선수의 근처에 있다(플레이가 선수와 결합돼 있음)', () => {
    const m = new MatchMotion();
    m.setInput(baseInput({ x: 0.5, y: 0.5 }));
    for (let i = 0; i < 300; i++) {
      m.setInput(baseInput({ x: Math.abs(Math.sin(i / 9)), y: 0.3 + 0.4 * Math.abs(Math.cos(i / 6)) }, i % 2 ? 'away' : 'home'));
      m.step(1 / 60);
    }
    const nearestToBall = Math.min(...m.players.map((p) => Math.hypot(p.pos.x - m.ball.pos.x, p.pos.y - m.ball.pos.y)));
    expect(nearestToBall).toBeLessThan(0.12);
  });

  it('결정적이다 — 같은 입력·같은 dt 시퀀스면 같은 위치를 낸다', () => {
    const seq: Vec[] = Array.from({ length: 120 }, (_, i) => ({ x: Math.abs(Math.sin(i / 8)), y: Math.abs(Math.cos(i / 4)) }));
    const play = (): MatchMotion => {
      const m = new MatchMotion();
      m.setInput(baseInput(seq[0]!));
      seq.forEach((z, i) => { m.setInput(baseInput(z, i % 2 ? 'away' : 'home')); m.step(1 / 60); });
      return m;
    };
    const a = play();
    const b = play();
    for (let i = 0; i < a.players.length; i++) {
      expect(b.players[i]!.pos.x).toBeCloseTo(a.players[i]!.pos.x, 10);
      expect(b.players[i]!.pos.y).toBeCloseTo(a.players[i]!.pos.y, 10);
    }
    expect(b.ball.pos.x).toBeCloseTo(a.ball.pos.x, 10);
    expect(b.ball.pos.y).toBeCloseTo(a.ball.pos.y, 10);
  });

  it('pace가 높은 선수가 같은 목표까지 더 빨리 이동한다', () => {
    // 앵커에서 멀리 떨어진 공(코너)으로 끌어당겨, pace 차이가 이동 속도에 드러나게 한다.
    const mk = (pace: number) => {
      const a = anchors();
      const m = new MatchMotion();
      const input: MotionInput = {
        homeAnchors: a.home, awayAnchors: a.away, homeIsGK: a.homeGK, awayIsGK: a.awayGK,
        ballZone: { x: 0.5, y: 0.5 }, possession: 'home',
        homePace: a.home.map(() => pace),
      };
      m.setInput(input);
      // 한 필드플레이어(공에서 가장 가까운)를 추적.
      run(m, 0.5, 1 / 60);
      return m;
    };
    const slow = mk(0.8);
    const fast = mk(1.2);
    // 같은 초를 진행했을 때 빠른 팀의 평균 이동량이 더 크다.
    const disp = (m: MatchMotion) => m.players
      .filter((p) => p.side === 'home' && !p.isGK)
      .reduce((s, p) => s + Math.hypot(p.pos.x - p.anchor.x, p.pos.y - p.anchor.y), 0);
    expect(disp(fast)).toBeGreaterThan(disp(slow));
  });

  it('점유 중 공이 전진하면 공격 성향 선수가 앵커보다 상대 골 쪽으로 침투한다', () => {
    const a = anchors();
    const m = new MatchMotion();
    // 공을 홈 공격 진영 깊숙이(x=0.7) 두고 홈 점유. 전진 성향 선수에게 높은 run.
    m.setInput({
      homeAnchors: a.home, awayAnchors: a.away, homeIsGK: a.homeGK, awayIsGK: a.awayGK,
      ballZone: { x: 0.7, y: 0.5 }, possession: 'home',
      homeRun: a.home.map(() => 1.4),
    });
    // 가장 전진한(앵커 x 최대) 홈 필드플레이어를 추적.
    const striker = m.players.filter((p) => p.side === 'home' && !p.isGK)
      .reduce((x, y) => (x.anchor.x > y.anchor.x ? x : y));
    const anchorX = striker.anchor.x;
    // 침투 게이트가 열리는 구간을 포함하도록 넉넉히 진행하며 최대 전진 x를 관찰.
    let maxX = striker.pos.x;
    for (let i = 0; i < 480; i++) {
      m.setInput({
        homeAnchors: a.home, awayAnchors: a.away, homeIsGK: a.homeGK, awayIsGK: a.awayGK,
        ballZone: { x: 0.7, y: 0.5 }, possession: 'home', homeRun: a.home.map(() => 1.4),
      });
      m.step(1 / 60);
      maxX = Math.max(maxX, striker.pos.x);
    }
    expect(maxX).toBeGreaterThan(anchorX + 0.03);
  });

  it('step 후 볼 캐리어가 지정되고, 캐리어는 공 근처의 필드플레이어다', () => {
    const m = new MatchMotion();
    m.setInput(baseInput({ x: 0.6, y: 0.4 }));
    run(m, 3);
    expect(m.carrier).not.toBeNull();
    expect(m.carrier!.isGK).toBe(false);
    const dCarrier = Math.hypot(m.carrier!.pos.x - m.ball.pos.x, m.carrier!.pos.y - m.ball.pos.y);
    expect(dCarrier).toBeLessThan(0.12);
  });

  it('골키퍼는 자기 골문 근처를 벗어나지 않는다', () => {
    const m = new MatchMotion();
    m.setInput(baseInput({ x: 0.9, y: 0.5 })); // 원정 골문 쪽으로 공
    run(m, 5);
    const homeGK = m.players.find((p) => p.side === 'home' && p.isGK)!;
    const awayGK = m.players.find((p) => p.side === 'away' && p.isGK)!;
    expect(homeGK.pos.x).toBeLessThan(0.15);
    expect(awayGK.pos.x).toBeGreaterThan(0.85);
  });
});
