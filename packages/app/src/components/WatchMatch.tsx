import { useRef, useState } from 'react';
import {
  LiveMatch, HALF_TIME, currentAbility,
  type Club, type Tactic, type MatchEvent, type MatchResult,
} from '@soccer-tycoon/engine';
import type { WatchSetup } from '../game.js';
import { Tactics } from './Tactics.js';

interface Props {
  watch: WatchSetup;
  myClub: Club;
  initialTactic: Tactic;
  onDone: (result: MatchResult) => void;
  onCancel: () => void;
}

type Phase = 'ready' | 'halftime' | 'fulltime';

const OUTCOME: Record<string, string> = {
  GOAL: '⚽ 골!', SAVE: '🧤 선방', OFF_TARGET: '➡️ 빗나감', BLOCKED: '🛡️ 블록',
};

export function WatchMatch({ watch, myClub, initialTactic, onDone, onCancel }: Props) {
  const liveRef = useRef<LiveMatch | null>(null);
  if (liveRef.current === null) liveRef.current = new LiveMatch(watch.setup);
  const live = liveRef.current;

  const homeName = watch.setup.home.club.name;
  const awayName = watch.setup.away.club.name;
  const userSide: 'home' | 'away' = watch.userIsHome ? 'home' : 'away';

  const [phase, setPhase] = useState<Phase>('ready');
  const [firstHalf, setFirstHalf] = useState<MatchEvent[]>([]);
  const [secondHalf, setSecondHalf] = useState<MatchEvent[]>([]);
  const [score, setScore] = useState<[number, number]>([0, 0]);
  const [tactic, setTactic] = useState<Tactic>(initialTactic);

  function kickoff() {
    setFirstHalf(live.runFirstHalf());
    setScore(live.score());
    setPhase('halftime');
  }

  function startSecondHalf() {
    // 하프타임에 바꾼 전술을 후반에 반영
    live.setTactic(userSide, tactic);
    setSecondHalf(live.runToEnd());
    setScore(live.score());
    setPhase('fulltime');
  }

  return (
    <div className="watch">
      <div className="scoreboard">
        <button className="btn-ghost back" onClick={onCancel}>← 취소</button>
        <span className={`sb-team ${watch.userIsHome ? 'mine' : ''}`}>{homeName}</span>
        <span className="sb-score">{score[0]} : {score[1]}</span>
        <span className={`sb-team ${!watch.userIsHome ? 'mine' : ''}`}>{awayName}</span>
        <span className="sb-clock">{phase === 'ready' ? "0'" : phase === 'halftime' ? "HT" : "FT"}</span>
      </div>

      {phase === 'ready' && (
        <div className="watch-center">
          <p className="muted">상대: <b>{watch.opponent.name}</b> (평균 CA {avgCA(watch.opponent)})</p>
          <button className="btn-advance big" onClick={kickoff}>킥오프 ▶ (전반 진행)</button>
        </div>
      )}

      {phase !== 'ready' && (
        <div className="watch-body">
          <div className="commentary">
            <h3>전반</h3>
            <EventFeed events={firstHalf} userSide={userSide} />
            {phase === 'fulltime' && (
              <>
                <h3>후반</h3>
                <EventFeed events={secondHalf} userSide={userSide} />
              </>
            )}
          </div>

          <div className="watch-side">
            {phase === 'halftime' && (
              <>
                <div className="ht-banner">하프타임 — 전술을 조정할 수 있습니다</div>
                <Tactics club={myClub} tactic={tactic} onChange={setTactic} />
                <button className="btn-advance" onClick={startSecondHalf}>후반 시작 ▶</button>
              </>
            )}
            {phase === 'fulltime' && (
              <div className="ft-panel">
                <h3>경기 종료</h3>
                <p className="ft-score">{homeName} {score[0]} : {score[1]} {awayName}</p>
                {(() => {
                  const cards = live.result().cards;
                  if (cards.length === 0) return null;
                  return (
                    <ul className="card-list">
                      {cards.map((c, i) => (
                        <li key={i}>
                          <span className="feed-min">{c.minute}'</span>
                          <span>{c.type === 'red' ? '🟥' : '🟨'} {c.playerName}</span>
                        </li>
                      ))}
                    </ul>
                  );
                })()}
                <button className="btn-advance" onClick={() => onDone(live.result())}>
                  결과 확정 및 라운드 진행 →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EventFeed({ events, userSide }: { events: MatchEvent[]; userSide: 'home' | 'away' }) {
  const notable = events.filter((e) => e.outcome === 'GOAL' || e.outcome === 'SAVE');
  if (notable.length === 0) return <p className="muted small">주요 장면 없음</p>;
  return (
    <ul className="feed">
      {notable.map((e, i) => (
        <li key={i} className={e.outcome === 'GOAL' ? (e.side === userSide ? 'goal mine' : 'goal') : ''}>
          <span className="feed-min">{e.minute}'</span>
          <span className="feed-text">{e.playerName} — {OUTCOME[e.outcome]}</span>
        </li>
      ))}
    </ul>
  );
}

function avgCA(club: Club): number {
  return Math.round(club.players.reduce((s, p) => s + currentAbility(p), 0) / club.players.length);
}
