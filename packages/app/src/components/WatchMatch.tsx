import { useEffect, useRef, useState } from 'react';
import {
  LiveMatch, HALF_TIME, MATCH_LENGTH, currentAbility,
  type Club, type Tactic, type MatchEvent, type MatchResult,
} from '@soccer-tycoon/engine';
import type { WatchSetup } from '../game.js';
import { Tactics } from './Tactics.js';
import { MatchPitch, type PitchState } from './MatchPitch.js';

interface Props {
  watch: WatchSetup;
  myClub: Club;
  initialTactic: Tactic;
  onDone: (result: MatchResult) => void;
  onCancel: () => void;
}

type Phase = 'ready' | 'playing' | 'halftime' | 'playing2' | 'fulltime';
const TICK_MS = 130;

const OUTCOME: Record<string, string> = {
  GOAL: '⚽ 골!', SAVE: '🧤 선방', OFF_TARGET: '➡️ 빗나감', BLOCKED: '🛡️ 블록',
};

interface View {
  minute: number;
  score: [number, number];
  ball: { x: number; y: number };
  goalFlash: 'home' | 'away' | null;
}

export function WatchMatch({ watch, myClub, initialTactic, onDone, onCancel }: Props) {
  const liveRef = useRef<LiveMatch | null>(null);
  if (liveRef.current === null) liveRef.current = new LiveMatch(watch.setup);
  const live = liveRef.current;
  const minuteRef = useRef(0);

  const homeName = watch.setup.home.club.name;
  const awayName = watch.setup.away.club.name;
  const userSide: 'home' | 'away' = watch.userIsHome ? 'home' : 'away';

  const [phase, setPhase] = useState<Phase>('ready');
  const [view, setView] = useState<View>({ minute: 0, score: [0, 0], ball: { x: 0.5, y: 0.5 }, goalFlash: null });
  const [feed, setFeed] = useState<MatchEvent[]>([]);
  const [tactic, setTactic] = useState<Tactic>(initialTactic);

  function applyMinute(target: number, evs: MatchEvent[]) {
    const last = evs[evs.length - 1];
    const goal = evs.find((e) => e.outcome === 'GOAL');
    const ball = last
      ? { x: last.side === 'home' ? 0.84 : 0.16, y: 0.28 + Math.random() * 0.44 }
      : { x: 0.4 + Math.random() * 0.2, y: 0.34 + Math.random() * 0.32 };
    setView({ minute: target, score: live.score(), ball, goalFlash: goal ? goal.side : null });
    const notable = evs.filter((e) => e.outcome === 'GOAL' || e.outcome === 'SAVE');
    if (notable.length) setFeed((f) => [...notable.reverse(), ...f]);
  }

  // 분 단위 진행 타이머 (phase가 진행 중일 때만)
  useEffect(() => {
    if (phase !== 'playing' && phase !== 'playing2') return;
    const id = setInterval(() => {
      const target = Math.min(minuteRef.current + 1, MATCH_LENGTH);
      if (target === minuteRef.current) return;
      const evs = live.runUntil(target);
      minuteRef.current = target;
      applyMinute(target, evs);
    }, TICK_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // 경계(하프타임·풀타임) 전환
  useEffect(() => {
    if (phase === 'playing' && view.minute >= HALF_TIME) setPhase('halftime');
    if (phase === 'playing2' && view.minute >= MATCH_LENGTH) setPhase('fulltime');
  }, [view.minute, phase]);

  function skip() {
    const boundary = phase === 'playing' ? HALF_TIME : MATCH_LENGTH;
    const evs = live.runUntil(boundary);
    minuteRef.current = boundary;
    applyMinute(boundary, evs);
  }

  function startSecondHalf() {
    live.setTactic(userSide, tactic);
    setPhase('playing2');
  }

  const pitch: PitchState = {
    homeName, awayName, score: view.score, minute: view.minute,
    ball: view.ball, goalFlash: view.goalFlash, userIsHome: watch.userIsHome,
  };

  return (
    <div className="watch">
      <div className="watch-topbar">
        <button className="btn-ghost" onClick={onCancel}>← 취소</button>
        <span className="muted">상대: <b>{watch.opponent.name}</b> (평균 CA {avgCA(watch.opponent)})</span>
      </div>

      <div className="watch-2col">
        <div>
          <MatchPitch {...pitch} />
          <div className="watch-controls">
            {phase === 'ready' && (
              <button className="btn-advance big" onClick={() => setPhase('playing')}>킥오프 ▶</button>
            )}
            {(phase === 'playing' || phase === 'playing2') && (
              <button className="btn-ghost" onClick={skip}>
                빠르게 ▶▶ ({phase === 'playing' ? '하프타임' : '경기 종료'}까지)
              </button>
            )}
            {phase === 'halftime' && (
              <button className="btn-advance" onClick={startSecondHalf}>후반 시작 ▶</button>
            )}
            {phase === 'fulltime' && (
              <button className="btn-advance" onClick={() => onDone(live.result())}>
                결과 확정 및 라운드 진행 →
              </button>
            )}
          </div>
        </div>

        <div className="watch-side">
          {phase === 'halftime' ? (
            <>
              <div className="ht-banner">하프타임 — 전술을 조정할 수 있습니다</div>
              <Tactics club={myClub} tactic={tactic} onChange={setTactic} />
            </>
          ) : phase === 'fulltime' ? (
            <FullTime result={live.result()} homeName={homeName} awayName={awayName} score={view.score} />
          ) : (
            <div className="commentary">
              <h3>중계</h3>
              <Feed events={feed} userSide={userSide} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Feed({ events, userSide }: { events: MatchEvent[]; userSide: 'home' | 'away' }) {
  if (events.length === 0) return <p className="muted small">아직 주요 장면이 없습니다.</p>;
  return (
    <ul className="feed">
      {events.map((e, i) => (
        <li key={i} className={e.outcome === 'GOAL' ? (e.side === userSide ? 'goal mine' : 'goal') : ''}>
          <span className="feed-min">{e.minute}'</span>
          <span className="feed-text">{e.playerName} — {OUTCOME[e.outcome]}</span>
        </li>
      ))}
    </ul>
  );
}

function FullTime({
  result, homeName, awayName, score,
}: { result: MatchResult; homeName: string; awayName: string; score: [number, number] }) {
  return (
    <div className="ft-panel">
      <h3>경기 종료</h3>
      <p className="ft-score">{homeName} {score[0]} : {score[1]} {awayName}</p>
      {result.cards.length > 0 && (
        <ul className="card-list">
          {result.cards.map((c, i) => (
            <li key={i}>
              <span className="feed-min">{c.minute}'</span>
              <span>{c.type === 'red' ? '🟥' : '🟨'} {c.playerName}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function avgCA(club: Club): number {
  return Math.round(club.players.reduce((s, p) => s + currentAbility(p), 0) / club.players.length);
}
