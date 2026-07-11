/**
 * 관전 피치 운동 모델(시뮬 관전 고도화) — 엔진의 분 단위 결정적 시뮬레이션은 그대로 두고,
 * 화면에 보이는 22명 선수와 공의 "움직임"만 렌더 레이어에서 자연스럽게 만든다.
 *
 * 핵심 아이디어:
 *  - 각 선수는 위치·속도를 갖고, 매 프레임 "전술 목표점"을 향해 스프링-댐퍼로 가속한다.
 *    목표점 = 포메이션 앵커 + 공을 향한 블록 슬라이드 + (점유/수비에 따른) 전진/후퇴 +
 *    거리 기반 압박·지원 끌림. 여기에 겹침 회피(분리)를 더해 뭉치지 않게 한다.
 *  - 공은 엔진이 알려주는 "현재 플레이 존"과 가장 가까운 선수(볼 캐리어)를 함께 참조해
 *    움직인다 — 존이 크게 바뀌면(패스·전환) 빠르게 날아가고, 평소엔 캐리어 곁에서
 *    드리블하듯 흔들린다.
 *
 * 이 모듈은 순수 표시용이라 엔진 결과·재현성에 전혀 영향을 주지 않는다.
 * Math.random / Date를 쓰지 않고, 누적 시계(clock)에 기반한 사인 흔들림만 써서
 * 같은 입력·같은 dt 시퀀스면 항상 같은 결과가 나오도록 결정적으로 유지한다.
 */

export interface Vec { x: number; y: number; }
export type Side = 'home' | 'away';

export interface MotionPlayer {
  side: Side;
  /** 소속 팀 내 슬롯 인덱스(라벨·색·플래시를 되짚는 데 사용). */
  idx: number;
  isGK: boolean;
  pos: Vec;
  vel: Vec;
  anchor: Vec;
  /** 이동 속도·가속 배율(선수 pace/가속 능력 반영, 0.8~1.2). 기본 1. */
  pace: number;
  /** 오프더볼 침투 런 성향(0.2~1.4). 기본 0.7. */
  run: number;
}

/** 매 분(또는 프레임마다) 갱신되는 전술 진실 입력 — 실제 피치 좌표(0~1, x=0 왼쪽 골). */
export interface MotionInput {
  /** 홈 11 앵커(홈은 +x로 공격). */
  homeAnchors: Vec[];
  /** 원정 11 앵커(이미 미러링되어 -x로 공격하는 실제 좌표). */
  awayAnchors: Vec[];
  homeIsGK: boolean[];
  awayIsGK: boolean[];
  /** 엔진이 알려주는 현재 플레이 존(공이 대략 있어야 할 곳). */
  ballZone: Vec;
  /** 현재 공을 잡은(공격 중인) 팀. */
  possession: Side;
  /** 슬롯별 이동 배율(선수 pace/가속). 생략 시 전원 1. */
  homePace?: number[];
  awayPace?: number[];
  /** 슬롯별 오프더볼 런 성향. 생략 시 전원 0.7. */
  homeRun?: number[];
  awayRun?: number[];
}

// ── 운동 상수(정규화 좌표/초 단위, 부드럽고 과하지 않게 튜닝) ──
const DT_MAX = 0.05;          // 한 프레임 최대 dt(탭 전환 후 점프 방지)
const ACCEL = 7.5;            // 목표점을 향한 가속
const DAMP = 5.0;             // 속도 감쇠(관성)
const MAX_SPEED = 0.5;        // 선수 최대 속도(피치 폭을 약 2초에 횡단)
const SEP_R = 0.05;           // 분리 반경
const SEP_K = 1.4;            // 분리 세기
const PRESS_R = 0.34;         // 공 끌림 유효 반경
const BALL_ACCEL = 9.0;
const BALL_DAMP = 3.2;
const BALL_MAX_SPEED = 1.3;   // 공은 선수보다 빠르게(패스·슈팅)

function attackDir(side: Side): number {
  return side === 'home' ? 1 : -1;
}
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export class MatchMotion {
  players: MotionPlayer[] = [];
  ball: { pos: Vec; vel: Vec } = { pos: { x: 0.5, y: 0.5 }, vel: { x: 0, y: 0 } };
  /** 현재 공을 잡은 선수(렌더에서 캐리어 하이라이트에 사용). step 후 갱신. */
  carrier: MotionPlayer | null = null;
  private possession: Side = 'home';
  private zone: Vec = { x: 0.5, y: 0.5 };
  private clock = 0;
  private initialized = false;

  /** 매 프레임 최신 전술 진실을 주입. 첫 호출 시 선수를 앵커에 스냅해 초기화한다. */
  setInput(input: MotionInput): void {
    this.zone = input.ballZone;
    this.possession = input.possession;
    if (!this.initialized) {
      this.players = [
        ...input.homeAnchors.map((a, i) => this.makePlayer('home', i, input.homeIsGK[i] ?? false, a,
          input.homePace?.[i] ?? 1, input.homeRun?.[i] ?? 0.7)),
        ...input.awayAnchors.map((a, i) => this.makePlayer('away', i, input.awayIsGK[i] ?? false, a,
          input.awayPace?.[i] ?? 1, input.awayRun?.[i] ?? 0.7)),
      ];
      this.ball = { pos: { x: 0.5, y: 0.5 }, vel: { x: 0, y: 0 } };
      this.initialized = true;
      return;
    }
    // 앵커·능력만 갱신(교체·포메이션 변경이 있으면 선수가 새 앵커로 부드럽게 달려간다).
    const home = this.players.filter((p) => p.side === 'home');
    const away = this.players.filter((p) => p.side === 'away');
    input.homeAnchors.forEach((a, i) => {
      const p = home[i]; if (!p) return;
      p.anchor = a; p.isGK = input.homeIsGK[i] ?? false;
      p.pace = input.homePace?.[i] ?? p.pace; p.run = input.homeRun?.[i] ?? p.run;
    });
    input.awayAnchors.forEach((a, i) => {
      const p = away[i]; if (!p) return;
      p.anchor = a; p.isGK = input.awayIsGK[i] ?? false;
      p.pace = input.awayPace?.[i] ?? p.pace; p.run = input.awayRun?.[i] ?? p.run;
    });
  }

  private makePlayer(side: Side, idx: number, isGK: boolean, anchor: Vec, pace: number, run: number): MotionPlayer {
    return { side, idx, isGK, pos: { ...anchor }, vel: { x: 0, y: 0 }, anchor: { ...anchor }, pace, run };
  }

  /** 물리를 dt초만큼 진행. */
  step(dtRaw: number): void {
    if (!this.initialized) return;
    const dt = clamp(dtRaw, 0, DT_MAX);
    if (dt <= 0) return;
    this.clock += dt;

    this.carrier = this.pickCarrier();
    this.updateBall(dt, this.carrier);

    // 1) 속도 갱신(모든 선수의 pos 스냅샷을 읽어 계산) → 2) 위치 적분.
    for (const p of this.players) this.accelerate(p, dt);
    for (const p of this.players) this.integrate(p, dt);
  }

  /** 공에 가장 가까운 선수를 캐리어로 뽑되, 공격(점유) 팀에 약간 가중을 준다. */
  private pickCarrier(): MotionPlayer | null {
    let best: MotionPlayer | null = null;
    let bestScore = Infinity;
    for (const p of this.players) {
      if (p.isGK) continue;
      const d = dist(p.pos, this.ball.pos);
      const score = d * (p.side === this.possession ? 0.8 : 1);
      if (score < bestScore) { bestScore = score; best = p; }
    }
    return best;
  }

  private updateBall(dt: number, carrier: MotionPlayer | null): void {
    // 공의 목표 = 엔진 존과 캐리어 위치의 혼합. 캐리어가 있으면 그 발끝(공격 방향 약간
    // 앞)에 붙어 드리블처럼 보이고, 존이 멀리 튀면(패스) 혼합점이 그쪽으로 당겨진다.
    let ox = this.zone.x;
    let oy = this.zone.y;
    if (carrier) {
      const fwd = attackDir(carrier.side) * 0.02;
      ox = this.zone.x * 0.5 + (carrier.pos.x + fwd) * 0.5;
      oy = this.zone.y * 0.5 + carrier.pos.y * 0.5;
    }
    // 드리블 흔들림(결정적 사인) — 공이 느릴수록 크게, 빠를수록(패스 중) 작게.
    const speed = Math.hypot(this.ball.vel.x, this.ball.vel.y);
    const wob = Math.max(0, 0.012 - speed * 0.02);
    ox += Math.sin(this.clock * 5.3) * wob;
    oy += Math.cos(this.clock * 4.7) * wob;

    this.ball.vel.x += (ox - this.ball.pos.x) * BALL_ACCEL * dt;
    this.ball.vel.y += (oy - this.ball.pos.y) * BALL_ACCEL * dt;
    const d = Math.max(0, 1 - BALL_DAMP * dt);
    this.ball.vel.x *= d; this.ball.vel.y *= d;
    const sp = Math.hypot(this.ball.vel.x, this.ball.vel.y);
    if (sp > BALL_MAX_SPEED) { this.ball.vel.x *= BALL_MAX_SPEED / sp; this.ball.vel.y *= BALL_MAX_SPEED / sp; }
    this.ball.pos.x = clamp(this.ball.pos.x + this.ball.vel.x * dt, 0.02, 0.98);
    this.ball.pos.y = clamp(this.ball.pos.y + this.ball.vel.y * dt, 0.03, 0.97);
  }

  /** 선수 목표점 계산 + 가속(분리 포함). 위치는 아직 옮기지 않는다. */
  private accelerate(p: MotionPlayer, dt: number): void {
    const target = this.targetFor(p);
    // 가속·최고속을 선수 pace로 스케일 — 빠른 선수가 더 민첩하게 반응한다.
    let ax = (target.x - p.pos.x) * ACCEL * p.pace;
    let ay = (target.y - p.pos.y) * ACCEL * p.pace;

    // 분리 — 반경 내 다른 선수에게서 밀려난다(뭉침 방지, 자연스러운 간격).
    for (const q of this.players) {
      if (q === p) continue;
      const dx = p.pos.x - q.pos.x;
      const dy = p.pos.y - q.pos.y;
      const d = Math.hypot(dx, dy);
      if (d > 0 && d < SEP_R) {
        const push = (1 - d / SEP_R) * SEP_K;
        ax += (dx / d) * push;
        ay += (dy / d) * push;
      }
    }

    p.vel.x += ax * dt;
    p.vel.y += ay * dt;
    const damp = Math.max(0, 1 - DAMP * dt);
    p.vel.x *= damp; p.vel.y *= damp;
    const maxSp = MAX_SPEED * p.pace;
    const sp = Math.hypot(p.vel.x, p.vel.y);
    if (sp > maxSp) { p.vel.x *= maxSp / sp; p.vel.y *= maxSp / sp; }
  }

  private integrate(p: MotionPlayer, dt: number): void {
    p.pos.x = clamp(p.pos.x + p.vel.x * dt, 0.02, 0.98);
    p.pos.y = clamp(p.pos.y + p.vel.y * dt, 0.04, 0.96);
  }

  /** 한 선수의 전술 목표점(실제 좌표). */
  private targetFor(p: MotionPlayer): Vec {
    const ball = this.ball.pos;
    if (p.isGK) {
      // 골키퍼는 자기 골문을 지키며 공 y를 살짝 따라간다.
      const gx = p.side === 'home' ? 0.04 : 0.96;
      return { x: gx, y: 0.5 + (ball.y - 0.5) * 0.35 };
    }
    const dir = attackDir(p.side);
    const attacking = p.side === this.possession;

    // 공을 향한 블록 슬라이드(팀이 한 덩어리로 공 쪽으로 미끄러짐).
    let tx = p.anchor.x + (ball.x - p.anchor.x) * 0.12;
    let ty = p.anchor.y + (ball.y - p.anchor.y) * 0.18;

    // 점유 시 전진 / 비점유 시 후퇴(자기 골 쪽).
    tx += dir * (attacking ? 0.05 : -0.03);

    // 거리 기반 압박·지원 끌림 — 공에 가까울수록 강하게 달려든다(수비가 더 강하게 압박).
    const dx = ball.x - p.pos.x;
    const dy = ball.y - p.pos.y;
    const d = Math.hypot(dx, dy);
    const pull = Math.max(0, 1 - d / PRESS_R);
    const pullK = (attacking ? 0.3 : 0.42) * pull * pull;
    tx += dx * pullK;
    ty += dy * pullK;

    // 오프더볼 침투 런 — 우리 팀 점유 + 공이 전진했을 때, 전진 성향 선수(공격 라인)가
    // 캐리어가 아니면 주기적으로 상대 골 쪽 공간으로 침투한다(선수마다 다른 타이밍).
    if (attacking && p !== this.carrier) {
      const advancedRole = dir > 0 ? p.anchor.x > 0.5 : p.anchor.x < 0.5;
      const ballAdvanced = dir > 0 ? ball.x > 0.55 : ball.x < 0.45;
      if (advancedRole && ballAdvanced) {
        const gate = Math.max(0, Math.sin(this.clock * 0.8 + p.idx * 2.3)); // 0~1 맥동
        const amt = 0.14 * p.run * gate;
        tx += dir * amt;
        ty += Math.sin(p.idx * 1.9) * 0.06 * gate; // 채널로 벌리는 횡 이동
      }
    }

    // 미세한 개인 흔들림(생동감) — 결정적 사인.
    tx += Math.sin(this.clock * 1.3 + p.idx * 2.1 + (p.side === 'home' ? 0 : 3)) * 0.004;
    ty += Math.cos(this.clock * 1.1 + p.idx * 1.7) * 0.004;

    return { x: clamp(tx, 0.03, 0.97), y: clamp(ty, 0.05, 0.95) };
  }
}

function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
