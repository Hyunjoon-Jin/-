import { useEffect, useRef } from 'react';
import type { Position, Weather } from '@soccer-tycoon/engine';
import type { KitColors } from '../clubColors.js';

export interface PitchState {
  homeName: string;
  awayName: string;
  score: [number, number];
  minute: number;
  /** 공 위치 (0~1, 0=홈 골문 좌측, 1=원정 골문 우측). */
  ball: { x: number; y: number };
  /** 방금 골 이벤트 하이라이트. */
  goalFlash: 'home' | 'away' | null;
  /** 방금 카드(옐로/레드) 이벤트 하이라이트 — 해당 슬롯 선수 위에 아이콘 표시(고도화 항목 B1). */
  cardFlash?: { side: 'home' | 'away'; slotIndex: number; type: 'yellow' | 'red' } | null;
  /** 방금 부상 이벤트 하이라이트 — 해당 슬롯 선수 위에 🚑 표시(고도화 항목 B2). */
  injuryFlash?: { side: 'home' | 'away'; slotIndex: number } | null;
  /** 득점자 세리머니 링(M5 D4) — 골 플래시 동안 해당 슬롯 점 주위로 확장 링을 그린다. */
  goalCelebrate?: { side: 'home' | 'away'; slotIndex: number } | null;
  /** 슈팅 궤적선(M7 D5) — 슈팅 순간 공 위치에서 골문 방향으로 잠깐 그려지는 선. */
  shotTrail?: { side: 'home' | 'away'; fromX: number; fromY: number; outcome: string; start: number } | null;
  /** 경기 날씨(M7 D8) — 비/혹한이면 캔버스에 파티클을 얹는다. */
  weather?: Weather;
  userIsHome: boolean;
  /** 홈/원정 선발 포메이션(슬롯 포지션 순서). 선수 점 배치에 사용. */
  homeFormation: Position[];
  awayFormation: Position[];
  /** 각 슬롯 선수의 이니셜(2자) — 포메이션과 같은 순서. 점 안에 라벨로 표시. */
  homeLabels: string[];
  awayLabels: string[];
  /** 라이벌전이면 스코어보드를 강조 표시. */
  isDerby?: boolean;
  /** 컵 결승이면 스코어보드를 금색으로 강조 표시(라이벌전보다 우선). */
  isFinal?: boolean;
  /** 구단별 킷 색상(고도화 항목 C1-C4) — 킷 충돌 시 자동 보정된 값을 그대로 사용. */
  kit: KitColors;
}

const W = 760;
const H = 460;

/** 볼 이동 보간(트윈) 지속시간(ms, 고도화 항목 A1) — 이전에는 분(minute)이 바뀔 때마다
 *  목표 위치로 순간이동했다. 고배속 관전 중 트윈이 끝나기 전에 다음 목표가 도착해도,
 *  그 시점의 화면상 보간 위치에서 새 목표로 다시 시작해 끊김 없이 이어진다. */
const BALL_TWEEN_MS = 260;

/** ease-out — 도착 직전에 감속해 더 자연스러운 멈춤을 준다. */
function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

// 우측 공격(홈) 기준 포지션별 기본 좌표(0~1). 원정은 x를 반전.
// PlayerDetail의 포지션 숙련도 맵(신규 개선 항목 15)도 같은 좌표계를 재사용해
// 포지션 배치 감각을 일관되게 유지한다.
export const LINE_X: Record<Position, number> = {
  GK: 0.05,
  DL: 0.20, DC: 0.19, DR: 0.20,
  WBL: 0.27, WBR: 0.27,
  DM: 0.35,
  ML: 0.50, MC: 0.48, MR: 0.50,
  AML: 0.66, AMC: 0.66, AMR: 0.66,
  ST: 0.84,
};
export const SIDE_Y: Record<Position, number> = {
  GK: 0.5,
  DL: 0.18, DC: 0.5, DR: 0.82,
  WBL: 0.10, WBR: 0.90,
  DM: 0.5,
  ML: 0.18, MC: 0.5, MR: 0.82,
  AML: 0.20, AMC: 0.5, AMR: 0.80,
  ST: 0.5,
};

/** 포메이션 → 정규화 좌표. 같은 x열에 몰린 선수는 y로 고르게 벌린다.
 *  커스텀 포메이션 드래그 에디터(선수관리 개선 항목34)도 동일 좌표계를 재사용한다. */
export function formationCoords(positions: Position[]): { x: number; y: number }[] {
  const raw = positions.map((p) => ({ x: LINE_X[p], y: SIDE_Y[p] }));
  const groups = new Map<number, number[]>();
  raw.forEach((r, i) => {
    const key = Math.round(r.x * 50);
    const arr = groups.get(key);
    if (arr) arr.push(i);
    else groups.set(key, [i]);
  });
  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue;
    idxs.sort((a, b) => raw[a]!.y - raw[b]!.y);
    const n = idxs.length;
    idxs.forEach((idx, k) => { raw[idx]!.y = 0.18 + 0.64 * (k / (n - 1)); });
  }
  return raw;
}

export function MatchPitch(props: PitchState) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  // 매 프레임 최신 props를 읽기 위한 ref — rAF 콜백은 마운트 시 한 번만 생성되므로
  // 클로저에 갇힌 값이 아니라 이 ref를 통해 항상 최신 스코어·분·포메이션 등을 읽는다.
  const propsRef = useRef(props);
  propsRef.current = props;

  // 볼 트윈 상태(고도화 항목 A1): from(트윈 시작 시점의 화면상 위치) → to(새 목표),
  // start(트윈 시작 시각, performance.now() 기준).
  const tweenRef = useRef({ from: props.ball, to: props.ball, start: performance.now() });
  const lastInterpolatedRef = useRef(props.ball);

  // 새 목표 위치(props.ball)가 도착하면, 현재 화면에 보이는 보간 위치에서 새 목표로
  // 다시 트윈을 시작한다(이전 트윈이 끝났든 진행 중이든 항상 끊김 없이 이어짐).
  useEffect(() => {
    tweenRef.current = { from: lastInterpolatedRef.current, to: props.ball, start: performance.now() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.ball.x, props.ball.y]);

  // requestAnimationFrame으로 매 프레임 트윈 진행률을 계산해 다시 그린다(고도화 항목 A1).
  // propsRef가 항상 최신 props를 담고 있어, 볼 이외의 변경(스코어·분·포메이션·골 플래시 등)도
  // 별도 effect 없이 이 루프 안에서 다음 프레임에 자연히 반영된다.
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const frame = (now: number) => {
      const tw = tweenRef.current;
      const t = Math.min(1, (now - tw.start) / BALL_TWEEN_MS);
      const eased = easeOutQuad(t);
      const interpolated = {
        x: tw.from.x + (tw.to.x - tw.from.x) * eased,
        y: tw.from.y + (tw.to.y - tw.from.y) * eased,
      };
      lastInterpolatedRef.current = interpolated;
      draw(ctx, { ...propsRef.current, ball: interpolated }, now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} width={W} height={H} className="pitch-canvas" />;
}

function draw(ctx: CanvasRenderingContext2D, s: PitchState, now: number) {
  const m = 24; // 여백
  const pw = W - m * 2;
  const ph = H - m * 2;

  // 잔디 — 중앙에서 가장자리로 은은하게 어두워지는 비네트로 깊이감을 준다.
  const grassGrad = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, W * 0.68);
  grassGrad.addColorStop(0, '#1f7a3d');
  grassGrad.addColorStop(1, '#153f22');
  ctx.fillStyle = grassGrad;
  ctx.fillRect(0, 0, W, H);
  // 줄무늬 — 깎은 잔디결처럼 반투명 하이라이트를 얹어(불투명 색 대신) 비네트가 비쳐 보이게 한다.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  const stripes = 10;
  for (let i = 0; i < stripes; i += 2) {
    ctx.fillRect(m + (pw / stripes) * i, m, pw / stripes, ph);
  }

  // 라인
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 2;
  ctx.strokeRect(m, m, pw, ph);
  // 센터라인
  ctx.beginPath();
  ctx.moveTo(W / 2, m); ctx.lineTo(W / 2, m + ph); ctx.stroke();
  // 센터서클
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 46, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();

  // 페널티 박스 + 골문
  const boxH = 200, boxW = 90, goalH = 90;
  const drawBox = (left: boolean) => {
    const x = left ? m : m + pw - boxW;
    ctx.strokeRect(x, H / 2 - boxH / 2, boxW, boxH);
    const gx = left ? m - 6 : m + pw;
    ctx.strokeRect(gx, H / 2 - goalH / 2, 6, goalH);
  };
  drawBox(true); drawBox(false);

  // ── 선수 점 배치 ──────────────────────────────────────────
  // 공 x에 따라 양 팀이 함께 밀린다(콤팩트 블록). y는 미세하게 흔들려 생동감.
  const shift = (s.ball.x - 0.5) * 0.12;

  const drawTeam = (
    formation: Position[], labels: string[], mirror: boolean,
    color: string, gkColor: string, side: 'home' | 'away',
  ) => {
    const coords = formationCoords(formation);
    const isMine = side === (s.userIsHome ? 'home' : 'away');
    coords.forEach((c, i) => {
      const baseX = mirror ? 1 - c.x : c.x;
      const sway = Math.sin(s.minute * 0.6 + i * 1.7) * 0.015;
      const nx = Math.min(0.97, Math.max(0.03, baseX + shift));
      const ny = Math.min(0.95, Math.max(0.05, c.y + sway));
      const px = m + nx * pw;
      const py = m + ny * ph;
      ctx.beginPath();
      ctx.arc(px, py, 8, 0, Math.PI * 2);
      ctx.fillStyle = formation[i] === 'GK' ? gkColor : color;
      ctx.fill();
      // 내 팀은 흰색 굵은 테두리로 한눈에 구분되게 한다(킷 색상이 실제 구단색으로
      // 바뀌면서(항목 C1) 기존 초록/빨강 고정 색으로 하던 아군 식별을 대체).
      ctx.strokeStyle = isMine ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.55)';
      ctx.lineWidth = isMine ? 2.2 : 1.5;
      ctx.stroke();
      const label = labels[i];
      if (label) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 7px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, px, py + 0.5);
      }
      if (s.cardFlash && s.cardFlash.side === side && s.cardFlash.slotIndex === i) {
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(s.cardFlash.type === 'red' ? '🟥' : '🟨', px, py - 12);
      }
      if (s.injuryFlash && s.injuryFlash.side === side && s.injuryFlash.slotIndex === i) {
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('🚑', px, py - 12);
      }
      // 득점자 세리머니 링(M5 D4) — 0.6초 주기로 확장·소멸을 반복하는 금색 링.
      if (s.goalCelebrate && s.goalCelebrate.side === side && s.goalCelebrate.slotIndex === i) {
        const t = (now / 600) % 1;
        ctx.beginPath();
        ctx.arc(px, py, 10 + t * 14, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 215, 0, ${(1 - t) * 0.9})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    });
  };
  drawTeam(s.homeFormation, s.homeLabels, false, s.kit.home, s.kit.homeGk, 'home');
  drawTeam(s.awayFormation, s.awayLabels, true, s.kit.away, s.kit.awayGk, 'away');
  ctx.textBaseline = 'alphabetic';

  // 공
  const bx = m + s.ball.x * pw;
  const by = m + s.ball.y * ph;
  ctx.beginPath();
  ctx.arc(bx, by, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.stroke();

  // 슈팅 궤적선(M7 D5) — 0.6초 동안 페이드아웃. 결과별로 도착점이 달라
  // 빗나감은 골대 밖, 블록은 중간에 끊긴다.
  const TRAIL_MS = 600;
  if (s.shotTrail && now - s.shotTrail.start < TRAIL_MS) {
    const tr = s.shotTrail;
    const t = (now - tr.start) / TRAIL_MS;
    const fx = m + tr.fromX * pw;
    const fy = m + tr.fromY * ph;
    const goalX = tr.side === 'home' ? m + pw : m;
    // 결과별 도착 y — 같은 이벤트는 같은 곳으로(분+아웃컴 해시).
    const jitter = ((tr.fromY * 997) % 1) - 0.5;
    let tx = goalX;
    let ty = H / 2 + jitter * 60;
    if (tr.outcome === 'OFF_TARGET') ty = H / 2 + (jitter >= 0 ? 1 : -1) * (70 + Math.abs(jitter) * 40);
    if (tr.outcome === 'BLOCKED') tx = fx + (goalX - fx) * 0.45;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(tx, ty);
    ctx.strokeStyle = `rgba(255, 255, 255, ${(1 - t) * 0.7})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // 날씨 파티클(M7 D8) — 비는 빗줄기, 혹한은 눈송이. 시간·인덱스 기반 의사난수라
  // 시뮬레이션 결정성과 무관한 순수 표시용이다.
  if (s.weather === 'rain') {
    ctx.strokeStyle = 'rgba(180, 205, 255, 0.32)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 46; i++) {
      const x = ((i * 127.3 + now * 0.38) % (W + 20)) - 10;
      const y = ((i * 211.7 + now * 0.62) % (H + 20)) - 10;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3, y + 11);
      ctx.stroke();
    }
  } else if (s.weather === 'cold') {
    ctx.fillStyle = 'rgba(240, 246, 255, 0.5)';
    for (let i = 0; i < 34; i++) {
      const x = ((i * 149.9 + now * 0.06 + Math.sin(now / 900 + i) * 18) % (W + 10)) - 5;
      const y = ((i * 233.1 + now * 0.13) % (H + 10)) - 5;
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
