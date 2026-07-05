import { useEffect, useMemo, useState } from 'react';
import {
  startGame, myClub, myTactic, setMyTactic,
  startSeason, playRound, playRestOfSeason, finishSeason, advanceFullSeason,
  playCupRound, playContinentalCupRound, negotiate, buyAt, buyViaReleaseClause, offersFor, acceptSell, release, upgradeStaffAction,
  upgradeStadiumAction, upgradeAcademyAction,
  loanOut, loanIn, recallLoan, swapDeal,
  setTrainingFocus, setTrainingPosition, renewContract,
  watchSetup, matchPreview, commitWatchedRound,
  watchCupSetup, cupPreview, commitWatchedCupRound,
  playerForm, playerTimeline, playerRatingHistory, respondMedia, dismissMedia, signContract,
  dispatchScoutAction, isScouted,
  type GameState, type ActionOutcome, type WatchSetup, type Difficulty, type MediaEvent,
} from './game.js';
import type { Tactic, MatchResult, LoanTerms } from '@soccer-tycoon/engine';
import { createSaveStore } from './storage.js';
import { recordSackedStint } from './career.js';
import { StartScreen } from './components/StartScreen.js';
import { Dashboard } from './components/Dashboard.js';
import { Squad } from './components/Squad.js';
import { Tactics } from './components/Tactics.js';
import { Match } from './components/Match.js';
import { Transfers } from './components/Transfers.js';
import { Stats } from './components/Stats.js';
import { Cup } from './components/Cup.js';
import { Staff } from './components/Staff.js';
import { History } from './components/History.js';
import { Help } from './components/Help.js';
import { PlayerDetail, FULL_SCOUTING } from './components/PlayerDetail.js';
import { WatchMatch } from './components/WatchMatch.js';
import type { Player } from '@soccer-tycoon/engine';

type Tab = 'dashboard' | 'squad' | 'tactics' | 'match' | 'cup' | 'stats' | 'transfers' | 'staff' | 'history';

const TABS: { key: Tab; label: string }[] = [
  { key: 'dashboard', label: '대시보드' },
  { key: 'squad', label: '스쿼드' },
  { key: 'tactics', label: '전술' },
  { key: 'match', label: '경기' },
  { key: 'cup', label: '컵' },
  { key: 'stats', label: '통계' },
  { key: 'transfers', label: '이적' },
  { key: 'staff', label: '스태프' },
  { key: 'history', label: '히스토리' },
];

function newSlotId(): string {
  // crypto.randomUUID는 충돌 확률이 사실상 0이라, Date.now()+정수 조합처럼
  // 드물게 충돌해 관계없는 세이브를 덮어쓸 위험이 없다.
  return `s_${crypto.randomUUID()}`;
}

export function App() {
  const store = useMemo(() => createSaveStore(), []);
  const [game, setGame] = useState<GameState | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [watching, setWatching] = useState<WatchSetup | null>(null);
  const [watchKind, setWatchKind] = useState<'league' | 'cup'>('league');
  const [showHelp, setShowHelp] = useState(false);
  const [detailPlayer, setDetailPlayer] = useState<Player | null>(null);
  const [saveError, setSaveError] = useState(false);
  /** 첫 시즌 체크리스트 진행 상황 — 탭 방문 여부로 추정(전술 확인 / 이적·스태프 보강). */
  const [visitedTactics, setVisitedTactics] = useState(false);
  const [visitedSquadPrep, setVisitedSquadPrep] = useState(false);
  useEffect(() => {
    if (tab === 'tactics') setVisitedTactics(true);
    if (tab === 'transfers' || tab === 'staff') setVisitedSquadPrep(true);
  }, [tab]);

  /** 상태 갱신 + 자동 저장. 경질로 새로 전환되면 커리어 아카이브에 재임 기록을 남긴다.
   *  게임 상태 반영(setGame)을 항상 먼저 수행 — 커리어 기록·저장은 부수 효과이므로
   *  그 쪽에서 예외(저장 공간 부족 등)가 나더라도 경질 전이 자체가 막히면 안 된다. */
  function update(next: GameState) {
    setGame(next);
    if (next.sacked && !game?.sacked) {
      try {
        recordSackedStint(next);
      } catch (err) {
        console.error('커리어 기록 저장 실패:', err);
      }
    }
    if (slotId) {
      try {
        setSavedAt(store.save(slotId, next).savedAt);
        setSaveError(false);
      } catch (err) {
        console.error('자동 저장 실패:', err);
        setSaveError(true);
      }
    }
  }

  /** 다른 세션(새 게임/불러오기/메뉴 복귀)으로 전환 시 이전 세션에 속한 오버레이 상태를
   *  반드시 함께 초기화한다 — 그러지 않으면 관전 화면이나 선수 상세 모달이 새 게임의
   *  club 데이터와 뒤섞인 채로 눌러붙어 대시보드로 돌아갈 수 없게 된다. */
  function resetOverlays() {
    setWatching(null);
    setDetailPlayer(null);
    setShowHelp(false);
    setSaveError(false);
  }

  function handleStart(seed: number, clubId: string, difficulty: Difficulty) {
    const state = startGame(seed, clubId, difficulty);
    const id = newSlotId();
    resetOverlays();
    setGame(state);
    setSlotId(id);
    setVisitedTactics(false);
    setVisitedSquadPrep(false);
    try {
      setSavedAt(store.save(id, state).savedAt);
    } catch (err) {
      console.error('자동 저장 실패:', err);
      setSaveError(true);
    }
    setTab('dashboard');
  }

  function handleLoad(id: string, state: GameState) {
    resetOverlays();
    setGame(state);
    setSlotId(id);
    setSavedAt(null);
    setVisitedTactics(false);
    setVisitedSquadPrep(false);
    setTab('dashboard');
  }

  function quitToMenu() {
    resetOverlays();
    setGame(null);
    setSlotId(null);
    setSavedAt(null);
  }

  if (!game) {
    return <StartScreen store={store} onStart={handleStart} onLoad={handleLoad} />;
  }

  if (game.sacked) {
    return <Sacked game={game} onQuit={quitToMenu} />;
  }

  const club = myClub(game);
  const savedLabel = savedAt
    ? `저장됨 ${new Date(savedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
    : '';

  const handleTacticChange = (t: Tactic) => update(setMyTactic(game, t));

  const runAction = <T,>(fn: (s: GameState, id: T) => ActionOutcome, id: T): ActionOutcome => {
    const outcome = fn(game, id);
    if (outcome.ok) update(outcome.state);
    return outcome;
  };

  const handleBuyAt = (id: string, fee: number): ActionOutcome => {
    const outcome = buyAt(game, id, fee);
    if (outcome.ok) update(outcome.state);
    return outcome;
  };

  const handleBuyViaReleaseClause = (id: string): ActionOutcome => {
    const outcome = buyViaReleaseClause(game, id);
    if (outcome.ok) update(outcome.state);
    return outcome;
  };

  const handleAcceptSell = (id: string, buyerId: string): ActionOutcome => {
    const outcome = acceptSell(game, id, buyerId);
    if (outcome.ok) update(outcome.state);
    return outcome;
  };

  const handleLoanOut = (id: string, toClubId: string, terms: LoanTerms): ActionOutcome => {
    const outcome = loanOut(game, id, toClubId, terms);
    if (outcome.ok) update(outcome.state);
    return outcome;
  };

  const handleLoanIn = (id: string, fromClubId: string, terms: LoanTerms): ActionOutcome => {
    const outcome = loanIn(game, id, fromClubId, terms);
    if (outcome.ok) update(outcome.state);
    return outcome;
  };

  const handleRecallLoan = (id: string): ActionOutcome => {
    const outcome = recallLoan(game, id);
    if (outcome.ok) update(outcome.state);
    return outcome;
  };

  const handleSwap = (myPlayerId: string, otherClubId: string, otherPlayerId: string, cashAdjustment: number): ActionOutcome => {
    const outcome = swapDeal(game, myPlayerId, otherClubId, otherPlayerId, cashAdjustment);
    if (outcome.ok) update(outcome.state);
    return outcome;
  };

  const handleWatch = () => {
    const ws = watchSetup(game);
    if (ws) { setWatchKind('league'); setWatching(ws); }
  };
  const handleWatchCup = () => {
    const ws = watchCupSetup(game);
    if (ws) { setWatchKind('cup'); setWatching(ws); }
  };
  const handleWatchDone = (result: MatchResult) => {
    update(watchKind === 'cup' ? commitWatchedCupRound(game, result) : commitWatchedRound(game, result));
    setWatching(null);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">⚽ Soccer Tycoon</div>
        <button className="btn-ghost" onClick={quitToMenu} title="메뉴로 (자동 저장됨)">← 메뉴</button>
        <div className="club-info">
          {saveError
            ? <span className="saved-badge save-error" title="저장 공간이 부족하거나 접근할 수 없습니다.">저장 실패</span>
            : (savedLabel && <span className="saved-badge">{savedLabel}</span>)}
          <span className="club-name">{club.name}</span>
          <span className="season-badge">시즌 {game.season}{game.live ? ' 진행중' : ' 프리시즌'}</span>
          <button className="btn-ghost help-btn" onClick={() => setShowHelp(true)} title="도움말">?</button>
        </div>
      </header>

      {showHelp && <Help onClose={() => setShowHelp(false)} />}
      {detailPlayer && (() => {
        const isMine = club.players.some((p) => p.id === detailPlayer.id);
        return (
          <PlayerDetail
            player={detailPlayer}
            onClose={() => setDetailPlayer(null)}
            onSetFocus={isMine ? (focus) => update(setTrainingFocus(game, detailPlayer.id, focus)) : undefined}
            onSetTrainingPosition={isMine ? (pos) => update(setTrainingPosition(game, detailPlayer.id, pos)) : undefined}
            onRenew={
              isMine
                ? () => { const o = renewContract(game, detailPlayer.id); if (o.ok) update(o.state); return o; }
                : undefined
            }
            recentForm={playerForm(game, detailPlayer.id)}
            timeline={playerTimeline(game, detailPlayer.id)}
            ratingHistory={playerRatingHistory(game, detailPlayer.id)}
            scouting={isMine ? FULL_SCOUTING : club.staff.scouting}
            scouted={isMine || isScouted(game, detailPlayer.id)}
            onDispatchScout={
              isMine ? undefined : () => runAction(dispatchScoutAction, detailPlayer.id)
            }
            loanFromClubName={game.clubs.find((c) => c.id === detailPlayer.loanFromClubId)?.name}
          />
        );
      })()}

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
            preview={watchKind === 'cup' ? cupPreview(game) : matchPreview(game)}
            rivalClubId={game.rivalClubId}
            onDone={handleWatchDone}
            onCancel={() => setWatching(null)}
          />
        ) : (
          <div key={tab} className="tab-content">
            {tab === 'dashboard' && (
              <Dashboard
                game={game}
                onSignContract={(years) => update(signContract(game, years))}
                visitedTactics={visitedTactics}
                visitedSquadPrep={visitedSquadPrep}
                onGoToTab={setTab}
              />
            )}
            {tab === 'squad' && <Squad key={slotId} club={club} onSelect={setDetailPlayer} />}
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
                onMediaRespond={(event, tone) => update(respondMedia(game, event, tone))}
                onMediaDismiss={(event) => update(dismissMedia(game, event))}
              />
            )}
            {tab === 'cup' && (
              <Cup
                game={game}
                onPlayCupRound={() => update(playCupRound(game))}
                onWatchCup={handleWatchCup}
                onPlayContinentalCupRound={() => update(playContinentalCupRound(game))}
              />
            )}
            {tab === 'staff' && (
              <Staff
                game={game}
                onUpgrade={(kind) => runAction(upgradeStaffAction, kind)}
                onUpgradeStadium={() => runAction(upgradeStadiumAction, undefined)}
                onUpgradeAcademy={() => runAction(upgradeAcademyAction, undefined)}
              />
            )}
            {tab === 'history' && <History game={game} />}
            {tab === 'stats' && <Stats game={game} />}
            {tab === 'transfers' && (
              <Transfers
                key={slotId}
                game={game}
                onNegotiate={(id, offer, round) => negotiate(game, id, offer, round)}
                onBuyAt={handleBuyAt}
                onBuyViaReleaseClause={handleBuyViaReleaseClause}
                onOffers={(id) => offersFor(game, id)}
                onAcceptSell={handleAcceptSell}
                onRelease={(id) => runAction(release, id)}
                onLoanOut={handleLoanOut}
                onLoanIn={handleLoanIn}
                onRecallLoan={handleRecallLoan}
                onSwap={handleSwap}
                onSelect={setDetailPlayer}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function Sacked({ game, onQuit }: { game: GameState; onQuit: () => void }) {
  const club = myClub(game);
  const seasons = game.history.length;
  const best = game.history.reduce<number | null>((b, s) => {
    const pos = s.table.findIndex((r) => r.clubId === game.myClubId) + 1;
    return pos > 0 && (b === null || pos < b) ? pos : b;
  }, null);
  return (
    <div className="app">
      <div className="sacked-screen">
        <h1>🏛 경질</h1>
        <p className="sacked-lead">
          <b>{club.name}</b> 보드진이 신뢰를 거두었습니다. {game.season - 1}시즌을 끝으로 계약이 해지되었습니다.
        </p>
        <p className="muted">
          재임 {seasons}시즌 · 최고 순위 {best ?? '-'}위
        </p>
        <p className="muted small">
          목표를 꾸준히 달성하면 이사회 신뢰도를 유지할 수 있습니다. 다시 도전해 보세요.
        </p>
        <p className="muted small">🎖️ 이 재임은 감독 커리어 기록에 영구 보존됩니다.</p>
        <button className="btn-advance big" onClick={onQuit}>메뉴로 돌아가기</button>
      </div>
    </div>
  );
}
