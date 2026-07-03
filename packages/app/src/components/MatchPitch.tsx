import { useEffect, useRef } from 'react';
import type { Position } from '@soccer-tycoon/engine';

export interface PitchState {
  homeName: string;
  awayName: string;
  score: [number, number];
  minute: number;
  /** 공 위치 (0~1, 0=홈 골문 좌측, 1=원정 골문 우측). */
  ball: { x: number; y: number };
  /** 방금 골 이벤트 하이라이트. */
  goalFlash: 'home' | 'away' | null;
  userIsHome: boolean;
  /** 홈/원정 선발 포메이션(슬롯 포지션 순서). 선수 점 배치에 사용. */
  homeFormation: Position[];
  awayFormation: Position[];
  /** 라이벌전이면 스코어보드를 강조 표시. */
  isDerby?: boolean;
  /** 컵 결승이면 스코어보드를 금색으로 강조 표시(라이벌전보다 우선). */
  isFinal?: boolean;
}

const W = 760;
const H = 460;

// 우측 공격(홈) 기준 포지션별 기본 좌표(0~1). 원정은 x를 반전.
const LINE_X: Record<Position, number> = {
  GK: 0.05,
  DL: 0.20, DC: 0.19, DR: 0.20,
  WBL: 0.27, WBR: 0.27,
  DM: 0.35,
  ML: 0.50, MC: 0.48, MR: 0.50,
  AML: 0.66, AMC: 0.66, AMR: 0.66,
  ST: 0.84,
};
const SIDE_Y: Record<Position, number> = {
  GK: 0.5,
  DL: 0.18, DC: 0.5, DR: 0.82,
  WBL: 0.10, WBR: 0.90,
  DM: 0.5,
  ML: 0.18, MC: 0.5, MR: 0.82,
  AML: 0.20, AMC: 0.5, AMR: 0.80,
  ST: 0.5,
};

/** 포메이션 → 정규화 좌표. 같은 x열에 몰린 선수는 y로 고르게 벌린다. */
function formationCoords(positions: Position[]): { x: number; y: number }[] {
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

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    draw(ctx, props);
    // props는 매 렌더마다 새로 생성되는 객체라 참조 자체를 의존성으로 두면 피치와
    // 무관한 상위 리렌더(중계 피드·통계 갱신 등)에도 캔버스를 다시 그린다.
    // 실제로 그림에 영향을 주는 원시값/직렬화 가능한 필드만 의존성으로 좁힌다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    props.homeName, props.awayName, props.score[0], props.score[1], props.minute,
    props.ball.x, props.ball.y, props.goalFlash, props.userIsHome,
    props.isDerby, props.isFinal,
    props.homeFormation.join(','), props.awayFormation.join(','),
  ]);

  return <canvas ref={ref} width={W} height={H} className="pitch-canvas" />;
}

function draw(ctx: CanvasRenderingContext2D, s: PitchState) {
  const m = 24; // 여백
  const pw = W - m * 2;
  const ph = H - m * 2;

  // 잔디
  ctx.fillStyle = '#1d6b34';
  ctx.fillRect(0, 0, W, H);
  // 줄무늬
  ctx.fillStyle = '#1f7439';
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
  const userColor = '#3ddc84', oppColor = '#e0574b';
  const homeColor = s.userIsHome ? userColor : oppColor;
  const awayColor = s.userIsHome ? oppColor : userColor;

  const drawTeam = (formation: Position[], mirror: boolean, color: string) => {
    const coords = formationCoords(formation);
    coords.forEach((c, i) => {
      const baseX = mirror ? 1 - c.x : c.x;
      const sway = Math.sin(s.minute * 0.6 + i * 1.7) * 0.015;
      const nx = Math.min(0.97, Math.max(0.03, baseX + shift));
      const ny = Math.min(0.95, Math.max(0.05, c.y + sway));
      const px = m + nx * pw;
      const py = m + ny * ph;
      ctx.beginPath();
      ctx.arc(px, py, 8, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  };
  drawTeam(s.homeFormation, false, homeColor);
  drawTeam(s.awayFormation, true, awayColor);

  // 공
  const bx = m + s.ball.x * pw;
  const by = m + s.ball.y * ph;
  ctx.beginPath();
  ctx.arc(bx, by, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.stroke();

  // 골 하이라이트
  if (s.goalFlash) {
    const gx = s.goalFlash === 'away' ? m + 12 : m + pw - 12;
    ctx.fillStyle = 'rgba(255,215,0,0.95)';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚽ GOAL!', gx > W / 2 ? W / 2 + 120 : W / 2 - 120, H / 2);
  }

  // 상단 스코어/시계 바 (컵 결승이면 금색, 라이벌전이면 적색으로 강조 — 결승이 우선)
  const highlight = s.isFinal ? 'final' : s.isDerby ? 'derby' : null;
  const barW = 300;
  ctx.fillStyle = highlight === 'final' ? 'rgba(110,88,10,0.85)' : highlight === 'derby' ? 'rgba(90,20,15,0.8)' : 'rgba(0,0,0,0.55)';
  ctx.fillRect(W / 2 - barW / 2, 4, barW, 26);
  if (highlight) {
    ctx.strokeStyle = highlight === 'final' ? '#f0be46' : '#ff6b4a';
    ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - barW / 2, 4, barW, 26);
  }
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  const homeMark = s.userIsHome ? '●' : '';
  const awayMark = !s.userIsHome ? '●' : '';
  const scoreboardText = `${homeMark}${s.homeName} ${s.score[0]} : ${s.score[1]} ${s.awayName}${awayMark}`;
  // 절차 생성된 긴 구단명이 고정폭 바를 넘으면 라이벌전·결승 트로피 아이콘과 겹치므로,
  // measureText로 실제 폭을 확인해 넘칠 때만 최소 폰트까지 점진적으로 축소한다.
  const maxTextW = barW - 16;
  let fontSize = 15;
  ctx.font = `bold ${fontSize}px sans-serif`;
  while (ctx.measureText(scoreboardText).width > maxTextW && fontSize > 10) {
    fontSize -= 1;
    ctx.font = `bold ${fontSize}px sans-serif`;
  }
  ctx.fillText(scoreboardText, W / 2, 22);
  if (highlight) {
    ctx.font = '16px sans-serif';
    const icon = highlight === 'final' ? '🏆' : '🔥';
    ctx.fillText(icon, W / 2 - barW / 2 - 14, 22);
    ctx.fillText(icon, W / 2 + barW / 2 + 14, 22);
  }
  // 시계
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(W / 2 - 26, H - 30, 52, 24);
  ctx.fillStyle = '#3ddc84';
  ctx.fillText(`${s.minute}'`, W / 2, H - 13);
}
