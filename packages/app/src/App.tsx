import { useState } from 'react';
import { startGame, advance, myClub, type GameState } from './game.js';
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

export function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');

  if (!game) {
    return <StartScreen onStart={(seed, clubId) => setGame(startGame(seed, clubId))} />;
  }

  const club = myClub(game);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">⚽ Soccer Tycoon</div>
        <div className="club-info">
          <span className="club-name">{club.name}</span>
          <span className="season-badge">시즌 {game.season}</span>
        </div>
        <button className="btn-advance" onClick={() => setGame(advance(game))}>
          ▶ 시즌 진행
        </button>
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
