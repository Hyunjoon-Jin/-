import { useMemo, useState } from 'react';
import {
  startGame, myClub, myTactic, setMyTactic,
  startSeason, playRound, playRestOfSeason, finishSeason, advanceFullSeason,
  playCupRound, buy, sell, release, watchSetup, commitWatchedRound,
  type GameState, type ActionOutcome, type WatchSetup,
} from './game.js';
import type { Tactic, MatchResult } from '@soccer-tycoon/engine';
import { createSaveStore } from './storage.js';
import { StartScreen } from './components/StartScreen.js';
import { Dashboard } from './components/Dashboard.js';
import { Squad } from './components/Squad.js';
import { Tactics } from './components/Tactics.js';
import { Match } from './components/Match.js';
import { Transfers } from './components/Transfers.js';
import { Stats } from './components/Stats.js';
import { Cup } from './components/Cup.js';
import { WatchMatch } from './components/WatchMatch.js';

type Tab = 'dashboard' | 'squad' | 'tactics' | 'match' | 'cup' | 'stats' | 'transfers';

const TABS: { key: Tab; label: string }[] = [
  { key: 'dashboard', label: '대시보드' },
  { key: 'squad', label: '스쿼드' },
  { key: 'tactics', label: '전술' },
  { key: 'match', label: '경기' },
  { key: 'cup', label: '컵' },
  { key: 'stats', label: '통계' },
  { key: 'transfers', label: '이적' },
];

function newSlotId(): string {
  return `s_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

export function App() {
  const store = useMemo(() => createSaveStore(), []);
  const [game, setGame] = useState<GameState | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [watching, setWatching] = useState<WatchSetup | null>(null);

  /** 상태 갱신 + 자동 저장. */
  function update(next: GameState) {
    setGame(next);
    if (slotId) setSavedAt(store.save(slotId, next).savedAt);
  }

  function handleStart(seed: number, clubId: string) {
    const state = startGame(seed, clubId);
    const id = newSlotId();
    setGame(state);
    setSlotId(id);
    setSavedAt(store.save(id, state).savedAt);
    setTab('dashboard');
  }

  function handleLoad(id: string, state: GameState) {
    setGame(state);
    setSlotId(id);
    setSavedAt(null);
    setTab('dashboard');
  }

  function quitToMenu() {
    setGame(null);
    setSlotId(null);
    setSavedAt(null);
  }

  if (!game) {
    return <StartScreen store={store} onStart={handleStart} onLoad={handleLoad} />;
  }

  const club = myClub(game);
  const savedLabel = savedAt
    ? `저장됨 ${new Date(savedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
    : '';

  const handleTacticChange = (t: Tactic) => update(setMyTactic(game, t));

  const runAction = (fn: (s: GameState, id: string) => ActionOutcome, id: string): ActionOutcome => {
    const outcome = fn(game, id);
    if (outcome.ok) update(outcome.state);
    return outcome;
  };

  const handleWatch = () => {
    const ws = watchSetup(game);
    if (ws) setWatching(ws);
  };
  const handleWatchDone = (result: MatchResult) => {
    update(commitWatchedRound(game, result));
    setWatching(null);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">⚽ Soccer Tycoon</div>
        <button className="btn-ghost" onClick={quitToMenu} title="메뉴로 (자동 저장됨)">← 메뉴</button>
        <div className="club-info">
          {savedLabel && <span className="saved-badge">{savedLabel}</span>}
          <span className="club-name">{club.name}</span>
          <span className="season-badge">시즌 {game.season}{game.live ? ' 진행중' : ' 프리시즌'}</span>
        </div>
      </header>

      {!watching && (
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? 'tab active' : 'tab'}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      )}

      <main className="content">
        {watching ? (
          <WatchMatch
            watch={watching}
            myClub={club}
            initialTactic={myTactic(game)}
            onDone={handleWatchDone}
            onCancel={() => setWatching(null)}
          />
        ) : (
          <>
            {tab === 'dashboard' && <Dashboard game={game} />}
            {tab === 'squad' && <Squad club={club} />}
            {tab === 'tactics' && (
              <Tactics club={club} tactic={myTactic(game)} onChange={handleTacticChange} />
            )}
            {tab === 'match' && (
              <Match
                game={game}
                onStartSeason={() => update(startSeason(game))}
                onPlayRound={() => update(playRound(game))}
                onPlayRest={() => update(playRestOfSeason(game))}
                onFinish={() => update(finishSeason(game))}
                onAdvanceFull={() => update(advanceFullSeason(game))}
                onWatch={handleWatch}
              />
            )}
            {tab === 'cup' && <Cup game={game} onPlayCupRound={() => update(playCupRound(game))} />}
            {tab === 'stats' && <Stats game={game} />}
            {tab === 'transfers' && (
              <Transfers
                game={game}
                onBuy={(id) => runAction(buy, id)}
                onSell={(id) => runAction(sell, id)}
                onRelease={(id) => runAction(release, id)}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
