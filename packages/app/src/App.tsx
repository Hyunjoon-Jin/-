import { useMemo, useState } from 'react';
import { startGame, advance, myClub, type GameState } from './game.js';
import { WebSaveStore } from './storage.js';
import { StartScreen } from './components/StartScreen.js';
import { Dashboard } from './components/Dashboard.js';
import { Squad } from './components/Squad.js';
import { LeagueTable } from './components/LeagueTable.js';
import { Transfers } from './components/Transfers.js';

type Tab = 'dashboard' | 'squad' | 'league' | 'transfers';

const TABS: { key: Tab; label: string }[] = [
  { key: 'dashboard', label: '대시보드' },
  { key: 'squad', label: '스쿼드' },
  { key: 'league', label: '리그' },
  { key: 'transfers', label: '이적' },
];

function newSlotId(): string {
  return `s_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

export function App() {
  const store = useMemo(() => new WebSaveStore(window.localStorage), []);
  const [game, setGame] = useState<GameState | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');

  function persist(id: string, state: GameState) {
    const meta = store.save(id, state);
    setSavedAt(meta.savedAt);
  }

  function handleStart(seed: number, clubId: string) {
    const state = startGame(seed, clubId);
    const id = newSlotId();
    setGame(state);
    setSlotId(id);
    persist(id, state);
    setTab('dashboard');
  }

  function handleLoad(id: string, state: GameState) {
    setGame(state);
    setSlotId(id);
    setSavedAt(null);
    setTab('dashboard');
  }

  function handleAdvance() {
    if (!game || !slotId) return;
    const next = advance(game);
    setGame(next);
    persist(slotId, next);
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

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">⚽ Soccer Tycoon</div>
        <button className="btn-ghost" onClick={quitToMenu} title="메뉴로 (자동 저장됨)">
          ← 메뉴
        </button>
        <div className="club-info">
          {savedLabel && <span className="saved-badge">{savedLabel}</span>}
          <span className="club-name">{club.name}</span>
          <span className="season-badge">시즌 {game.season}</span>
        </div>
        <button className="btn-advance" onClick={handleAdvance}>▶ 시즌 진행</button>
      </header>

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

      <main className="content">
        {tab === 'dashboard' && <Dashboard game={game} />}
        {tab === 'squad' && <Squad club={club} />}
        {tab === 'league' && <LeagueTable game={game} />}
        {tab === 'transfers' && <Transfers game={game} />}
      </main>
    </div>
  );
}
