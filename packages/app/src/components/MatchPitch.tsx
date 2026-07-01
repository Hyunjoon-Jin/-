import { useEffect, useRef } from 'react';

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
}

const W = 760;
const H = 460;

export function MatchPitch(props: PitchState) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    draw(ctx, props);
  }, [props]);

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

  // 공
  const bx = m + s.ball.x * pw;
  const by = m + s.ball.y * ph;
  ctx.beginPath();
  ctx.arc(bx, by, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.stroke();

  // 골 하이라이트
  if (s.goalFlash) {
    const left = s.goalFlash === 'away'; // away가 넣으면 홈 골문(좌측)
    const gx = left ? m + 12 : m + pw - 12;
    ctx.fillStyle = 'rgba(255,215,0,0.9)';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚽ GOAL!', gx > W / 2 ? W / 2 + 120 : W / 2 - 120, H / 2);
  }

  // 상단 스코어/시계 바
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(W / 2 - 150, 4, 300, 26);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  const homeMark = s.userIsHome ? '●' : '';
  const awayMark = !s.userIsHome ? '●' : '';
  ctx.fillText(`${homeMark}${s.homeName} ${s.score[0]} : ${s.score[1]} ${s.awayName}${awayMark}`, W / 2, 22);
  // 시계
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(W / 2 - 26, H - 30, 52, 24);
  ctx.fillStyle = '#3ddc84';
  ctx.fillText(`${s.minute}'`, W / 2, H - 13);
}
