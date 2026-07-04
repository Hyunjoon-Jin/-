import { useMemo, useState } from 'react';
import { myClub, lastSummary, revealPotential, type GameState, type ActionOutcome } from '../game.js';
import {
  transferTargets, marketValue, currentAbility, formatMoney, lineOf, buildScoutingReport,
  MAX_NEGOTIATION_ROUNDS,
  type Line, type Player, type OfferEvaluation, type TransferTarget, type SellOffer,
} from '@soccer-tycoon/engine';
import { ScoutingSummary } from './PlayerDetail.js';
import { useModalA11y } from './useModalA11y.js';
import { onKeyActivate } from '../a11y.js';
import { SortableTh } from './SortableTh.js';
import { useToast } from '../toast.js';
import { ConfirmDialog } from './ConfirmDialog.js';

interface Props {
  game: GameState;
  onNegotiate: (playerId: string, offer: number, round?: number) => OfferEvaluation;
  onBuyAt: (playerId: string, fee: number) => ActionOutcome;
  onBuyViaReleaseClause: (playerId: string) => ActionOutcome;
  onOffers: (playerId: string) => SellOffer[];
  onAcceptSell: (playerId: string, buyerId: string) => ActionOutcome;
  onRelease: (playerId: string) => ActionOutcome;
  onSelect: (p: Player) => void;
}

type Msg = { text: string; ok: boolean };

type LineFilter = 'ALL' | Line;
const LINE_FILTERS: { key: LineFilter; label: string }[] = [
  { key: 'ALL', label: '전체' },
  { key: 'GK', label: 'GK' },
  { key: 'DEF', label: '수비' },
  { key: 'MID', label: '미드' },
  { key: 'ATT', label: '공격' },
];

type AgeFilter = 'ALL' | 'young' | 'prime' | 'veteran';
const AGE_FILTERS: { key: AgeFilter; label: string; test: (age: number) => boolean }[] = [
  { key: 'ALL', label: '전체', test: () => true },
  { key: 'young', label: '유망주(≤23)', test: (a) => a <= 23 },
  { key: 'prime', label: '전성기(24~29)', test: (a) => a >= 24 && a <= 29 },
  { key: 'veteran', label: '베테랑(30+)', test: (a) => a >= 30 },
];

type MarketSortKey = 'age' | 'ca' | 'potential' | 'value';
type SortDir = 1 | -1;
/** 컬럼별 기본 정렬 방향(재클릭 시 이 방향을 뒤집는다). */
const DEFAULT_DIR: Record<MarketSortKey, SortDir> = { age: 1, ca: -1, potential: -1, value: 1 };

/** 내 스쿼드(판매/방출) 목록 정렬 기본 방향(영입 시장과 컬럼 구성이 같아 MarketSortKey를 공유). */
const SQUAD_DEFAULT_DIR: Record<MarketSortKey, SortDir> = { age: 1, ca: -1, potential: -1, value: -1 };

export function Transfers(props: Props) {
  // 시즌 진행 중에는 직접 이적 불가 → 지난 시즌 내역(읽기 전용)
  if (props.game.live) return <TransferHistory game={props.game} />;
  return <TransferMarket {...props} />;
}

function TransferMarket({
  game, onNegotiate, onBuyAt, onBuyViaReleaseClause, onOffers, onAcceptSell, onRelease, onSelect,
}: Props) {
  const club = myClub(game);
  const toast = useToast();
  const [line, setLine] = useState<LineFilter>('ALL');
  const [ageFilter, setAgeFilter] = useState<AgeFilter>('ALL');
  const [search, setSearch] = useState('');
  const [affordableOnly, setAffordableOnly] = useState(true);
  const [sort, setSort] = useState<MarketSortKey>('ca');
  const [dir, setDir] = useState<SortDir>(-1);
  const [squadSort, setSquadSort] = useState<MarketSortKey>('ca');
  const [squadDir, setSquadDir] = useState<SortDir>(-1);
  const [negotiating, setNegotiating] = useState<TransferTarget | null>(null);
  const [selling, setSelling] = useState<Player | null>(null);
  const [releasing, setReleasing] = useState<Player | null>(null);
  const [buyingViaClause, setBuyingViaClause] = useState<TransferTarget | null>(null);
  // 협상 중 진행된 라운드 수 — 선수별로 유지해, 모달을 닫았다 다시 열어도 조급증이 리셋되지 않는다.
  const [roundsUsed, setRoundsUsed] = useState<Record<string, number>>({});

  const budget = club.finance.transferBudget;
  const scouting = club.staff.scouting;

  function toggleSquadSort(k: MarketSortKey) {
    if (k === squadSort) { setSquadDir((d) => (d === 1 ? -1 : 1) as SortDir); return; }
    setSquadSort(k);
    setSquadDir(SQUAD_DEFAULT_DIR[k]);
  }

  function toggleSort(k: MarketSortKey) {
    if (k === sort) { setDir((d) => (d === 1 ? -1 : 1) as SortDir); return; }
    setSort(k);
    setDir(DEFAULT_DIR[k]);
  }

  const targets = useMemo(() => {
    let list = transferTargets(game.clubs, game.myClubId);
    if (line !== 'ALL') list = list.filter((t) => lineOf(t.player.position) === line);
    const ageTest = AGE_FILTERS.find((f) => f.key === ageFilter)!.test;
    list = list.filter((t) => ageTest(t.player.age));
    if (affordableOnly) list = list.filter((t) => t.value <= budget);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((t) => t.player.name.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      let cmp: number;
      switch (sort) {
        case 'age': cmp = a.player.age - b.player.age; break;
        case 'potential': cmp = a.player.potential - b.player.potential; break;
        case 'value': cmp = a.value - b.value; break;
        default: cmp = currentAbility(a.player) - currentAbility(b.player);
      }
      return cmp * dir;
    });
    return list.slice(0, 40);
  }, [game.clubs, game.myClubId, line, ageFilter, affordableOnly, search, sort, dir, budget]);

  const mySquad = useMemo(() => {
    const list = [...club.players];
    list.sort((a, b) => {
      let cmp: number;
      switch (squadSort) {
        case 'age': cmp = a.age - b.age; break;
        case 'potential': cmp = a.potential - b.potential; break;
        case 'value': cmp = marketValue(a) - marketValue(b); break;
        default: cmp = currentAbility(a) - currentAbility(b);
      }
      return cmp * squadDir;
    });
    return list;
  }, [club.players, squadSort, squadDir]);

  function act(outcome: ActionOutcome) {
    toast(outcome.message, outcome.ok);
  }

  return (
    <div className="market">
      <div className="market-head">
        <div>
          <span className="muted">이적 예산</span>{' '}
          <b className="budget">{formatMoney(budget)}</b>
          <span className="muted"> · 스쿼드 {club.players.length}명</span>
        </div>
      </div>

      <div className="market-cols">
        {/* 영입 시장 */}
        <div className="market-panel">
          <h3>영입 시장</h3>
          <div className="filters">
            {LINE_FILTERS.map((f) => (
              <button
                key={f.key}
                className={line === f.key ? 'chip active' : 'chip'}
                onClick={() => setLine(f.key)}
              >{f.label}</button>
            ))}
            <label className="afford">
              <input type="checkbox" checked={affordableOnly}
                onChange={(e) => setAffordableOnly(e.target.checked)} />
              예산 내
            </label>
          </div>
          <div className="filters">
            {AGE_FILTERS.map((f) => (
              <button
                key={f.key}
                className={ageFilter === f.key ? 'chip active' : 'chip'}
                onClick={() => setAgeFilter(f.key)}
              >{f.label}</button>
            ))}
          </div>
          <input className="search" placeholder="선수 이름 검색…" aria-label="선수 이름 검색"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <table className="data-table compact">
            <thead>
              <tr>
                <th>선수</th><th>구단</th><th>P</th>
                <SortableTh label="나이" k="age" sort={sort} dir={dir} onClick={toggleSort} />
                <SortableTh label="CA" k="ca" sort={sort} dir={dir} onClick={toggleSort} />
                <SortableTh
                  label="잠재" k="potential" sort={sort} dir={dir} onClick={toggleSort}
                  title={`스카우팅 Lv.${scouting}`}
                />
                <SortableTh label="가치" k="value" sort={sort} dir={dir} onClick={toggleSort} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {targets.map((t) => (
                <tr
                  key={t.player.id}
                  className="clickable"
                  onClick={() => onSelect(t.player)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={onKeyActivate(() => onSelect(t.player))}
                >
                  <td className="name">
                    {t.player.name}
                    {t.player.releaseClause !== undefined && (
                      <span className="clause-badge" title={`방출조항 ${formatMoney(t.player.releaseClause)} — 협상 없이 즉시 영입 가능`}>
                        🔓
                      </span>
                    )}
                  </td>
                  <td className="muted small">{t.clubName}</td>
                  <td><span className={`pos-chip pos-${lineOf(t.player.position).toLowerCase()}`}>{t.player.position}</span></td>
                  <td>{t.player.age}</td>
                  <td><b>{currentAbility(t.player).toFixed(0)}</b></td>
                  <td className="muted">{revealPotential(scouting, t.player.potential)}</td>
                  <td>{formatMoney(t.value)}</td>
                  <td className="market-actions">
                    <button
                      className="btn-small"
                      onClick={(e) => { e.stopPropagation(); setNegotiating(t); }}
                    >
                      협상
                    </button>
                    {t.player.releaseClause !== undefined && (
                      <button
                        className="btn-small clause-buy"
                        title={`방출조항 ${formatMoney(t.player.releaseClause)}로 즉시 영입`}
                        onClick={(e) => { e.stopPropagation(); setBuyingViaClause(t); }}
                      >
                        즉시영입
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {targets.length === 0 && (
                <tr><td colSpan={8} className="muted">조건에 맞는 매물이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 내 스쿼드 */}
        <div className="market-panel">
          <h3>내 스쿼드 ({club.players.length})</h3>
          <table className="data-table compact">
            <thead>
              <tr>
                <th>선수</th><th>P</th>
                <SortableTh label="나이" k="age" sort={squadSort} dir={squadDir} onClick={toggleSquadSort} />
                <SortableTh label="CA" k="ca" sort={squadSort} dir={squadDir} onClick={toggleSquadSort} />
                <SortableTh label="잠재" k="potential" sort={squadSort} dir={squadDir} onClick={toggleSquadSort} />
                <SortableTh label="가치" k="value" sort={squadSort} dir={squadDir} onClick={toggleSquadSort} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {mySquad.map((p: Player) => (
                <tr
                  key={p.id}
                  className="clickable"
                  onClick={() => onSelect(p)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={onKeyActivate(() => onSelect(p))}
                >
                  <td className="name">{p.name}</td>
                  <td><span className={`pos-chip pos-${lineOf(p.position).toLowerCase()}`}>{p.position}</span></td>
                  <td>{p.age}</td>
                  <td><b>{currentAbility(p).toFixed(0)}</b></td>
                  <td className="muted">{p.potential.toFixed(0)}</td>
                  <td>{formatMoney(marketValue(p))}</td>
                  <td className="sell-actions">
                    <button className="btn-small" onClick={(e) => { e.stopPropagation(); setSelling(p); }}>판매</button>
                    <button
                      className="btn-small danger"
                      onClick={(e) => { e.stopPropagation(); setReleasing(p); }}
                    >
                      방출
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {negotiating && (
        <NegotiationModal
          target={negotiating}
          budget={budget}
          scouting={scouting}
          round={roundsUsed[negotiating.player.id] ?? 0}
          onRoundChange={(r) => setRoundsUsed((prev) => ({ ...prev, [negotiating.player.id]: r }))}
          onNegotiate={onNegotiate}
          onBuyAt={onBuyAt}
          onResult={(m) => { toast(m.text, m.ok); if (m.ok) setNegotiating(null); }}
          onClose={() => setNegotiating(null)}
        />
      )}
      {buyingViaClause && (
        <ConfirmDialog
          title="방출조항 즉시 영입"
          message={`${buyingViaClause.player.name} 선수의 방출조항 ${formatMoney(buyingViaClause.player.releaseClause ?? 0)}을(를) 지불하고 협상 없이 즉시 영입하시겠습니까?`}
          confirmLabel="즉시 영입"
          onConfirm={() => { act(onBuyViaReleaseClause(buyingViaClause.player.id)); setBuyingViaClause(null); }}
          onCancel={() => setBuyingViaClause(null)}
        />
      )}
      {selling && (
        <SellModal
          player={selling}
          offers={onOffers(selling.id)}
          onAcceptSell={onAcceptSell}
          onResult={(m) => { toast(m.text, m.ok); if (m.ok) setSelling(null); }}
          onClose={() => setSelling(null)}
        />
      )}
      {releasing && (
        <ConfirmDialog
          title="선수 방출"
          message={`${releasing.name} 선수를 방출하시겠습니까? 보상 없이 영구히 스쿼드에서 빠집니다.`}
          confirmLabel="방출"
          danger
          onConfirm={() => { act(onRelease(releasing.id)); setReleasing(null); }}
          onCancel={() => setReleasing(null)}
        />
      )}
    </div>
  );
}

function SellModal({
  player, offers, onAcceptSell, onResult, onClose,
}: {
  player: Player;
  offers: SellOffer[];
  onAcceptSell: (playerId: string, buyerId: string) => ActionOutcome;
  onResult: (m: Msg) => void;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState<SellOffer | null>(null);
  const accept = (buyerId: string) => {
    const r = onAcceptSell(player.id, buyerId);
    onResult({ text: r.message, ok: r.ok });
  };
  const value = marketValue(player);
  const ref = useModalA11y<HTMLDivElement>(onClose);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal negotiate"
        role="dialog"
        aria-modal="true"
        aria-label={`판매 — ${player.name}`}
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>판매 — {player.name}</h2>
          <button className="btn-ghost" onClick={onClose}>닫기 ✕</button>
        </div>
        <p className="neg-sub muted">
          {player.position} · {player.age}세 · CA <b>{currentAbility(player).toFixed(0)}</b>
          {' · '}예상 가치 <b>{formatMoney(value)}</b>
        </p>
        {offers.length === 0 ? (
          <p className="toast err">관심 구단이 없습니다. 방출을 이용하세요.</p>
        ) : (
          <>
            <p className="muted small">{offers.length}개 구단이 입찰했습니다. 원하는 제안을 수락하세요.</p>
            <table className="data-table compact">
              <thead><tr><th>구단</th><th>입찰액</th><th></th></tr></thead>
              <tbody>
                {offers.map((o) => (
                  <tr key={o.clubId}>
                    <td className="name">{o.clubName}</td>
                    <td><b>{formatMoney(o.bid)}</b>
                      {o.bid >= value ? <span className="pos small"> (가치↑)</span> : <span className="muted small"> ({Math.round((o.bid / value) * 100)}%)</span>}
                    </td>
                    <td><button className="btn-small" onClick={() => setConfirming(o)}>수락</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
      {confirming && (
        <ConfirmDialog
          title="판매 확정"
          message={`${player.name} 선수를 ${confirming.clubName}에 ${formatMoney(confirming.bid)}에 판매하시겠습니까? 되돌릴 수 없습니다.`}
          confirmLabel="판매 확정"
          danger
          onConfirm={() => { accept(confirming.clubId); setConfirming(null); }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

function NegotiationModal({
  target, budget, scouting, round: initialRound, onRoundChange, onNegotiate, onBuyAt, onResult, onClose,
}: {
  target: TransferTarget;
  budget: number;
  scouting: number;
  /** 이 선수와의 협상에서 지금까지 진행된 역제안 횟수(0-base, 모달을 닫아도 유지). */
  round: number;
  onRoundChange: (round: number) => void;
  onNegotiate: (playerId: string, offer: number, round?: number) => OfferEvaluation;
  onBuyAt: (playerId: string, fee: number) => ActionOutcome;
  onResult: (m: Msg) => void;
  onClose: () => void;
}) {
  const { player, value } = target;
  const [ev, setEv] = useState<OfferEvaluation | null>(null);
  const [round, setRound] = useState(initialRound);

  const offer = (amount: number) => {
    const r = onNegotiate(player.id, amount, round);
    if (r.ok && r.outcome === 'accepted') {
      const bought = onBuyAt(player.id, amount);
      onResult({ text: bought.message, ok: bought.ok });
      return;
    }
    if (r.outcome === 'countered') {
      const nextRound = round + 1;
      setRound(nextRound);
      onRoundChange(nextRound);
    }
    setEv(r);
  };
  const acceptCounter = (counter: number) => {
    const bought = onBuyAt(player.id, counter);
    onResult({ text: bought.message, ok: bought.ok });
  };

  const PRESETS: { label: string; pct: number }[] = [
    { label: '가치의 90%', pct: 0.9 },
    { label: '가치대로', pct: 1.0 },
    { label: '가치의 110%', pct: 1.1 },
  ];

  const ref = useModalA11y<HTMLDivElement>(onClose);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal negotiate"
        role="dialog"
        aria-modal="true"
        aria-label={`협상 — ${player.name}`}
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>협상 — {player.name}</h2>
          <button className="btn-ghost" onClick={onClose}>닫기 ✕</button>
        </div>
        <p className="neg-sub muted">
          {player.position} · {player.age}세 · CA <b>{currentAbility(player).toFixed(0)}</b>
          {' · '}잠재 {revealPotential(scouting, player.potential)}
        </p>
        <ScoutingSummary report={buildScoutingReport(player, scouting)} title="🔎 스카우팅 평가" />
        <div className="neg-facts">
          <span>예상 가치 <b>{formatMoney(value)}</b></span>
          <span>이적 예산 <b className="budget">{formatMoney(budget)}</b></span>
          {ev?.asking !== undefined && <span>상대 호가 <b>{formatMoney(ev.asking)}</b></span>}
          <span className="muted small">라운드 {Math.min(round, MAX_NEGOTIATION_ROUNDS)}/{MAX_NEGOTIATION_ROUNDS}</span>
        </div>

        {ev && !ev.ok && <p className="toast err">{ev.reason}</p>}
        {ev?.outcome === 'rejected' && ev.roundsExhausted && (
          <p className="toast err">여러 차례 밀당했지만 이견을 좁히지 못해 상대가 협상을 접었습니다. 다음 시즌에 다시 시도하세요.</p>
        )}
        {ev?.outcome === 'rejected' && !ev.roundsExhausted && (
          <p className="toast err">제안이 너무 낮아 거절당했습니다. 더 높은 금액을 제시하세요.</p>
        )}
        {ev?.outcome === 'countered' && ev.counter !== undefined && (
          <div className="neg-counter">
            <p className="toast">상대가 <b>{formatMoney(ev.counter)}</b>를 요구합니다.</p>
            <button
              className="btn-advance"
              disabled={ev.counter > budget}
              onClick={() => acceptCounter(ev.counter!)}
            >요구액 수락 ({formatMoney(ev.counter)})</button>
          </div>
        )}

        <div className="neg-offers">
          <span className="muted small">제안하기</span>
          {PRESETS.map((p) => {
            const amount = Math.round(value * p.pct);
            return (
              <button
                key={p.label}
                className="btn-small"
                disabled={amount > budget || !!ev?.roundsExhausted}
                onClick={() => offer(amount)}
              >{p.label} ({formatMoney(amount)})</button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TransferHistory({ game }: { game: GameState }) {
  const last = lastSummary(game);
  return (
    <div className="transfers">
      <p className="muted">시즌 진행 중에는 직접 이적이 불가합니다. (프리시즌에 이용 가능)</p>
      {!last || last.transfers.length === 0 ? (
        <p className="muted">지난 시즌 이적 내역이 없습니다.</p>
      ) : (
        <>
          <h3>시즌 {last.season} 이적 시장 ({last.transfers.length}건)</h3>
          <table className="data-table">
            <thead><tr><th>선수</th><th>포지션</th><th>이적</th><th>이적료</th></tr></thead>
            <tbody>
              {last.transfers.map((d, i) => {
                const mine = d.toClubId === game.myClubId || d.fromClubId === game.myClubId;
                return (
                  <tr key={i} className={mine ? 'mine' : ''}>
                    <td className="name">{d.playerName}</td>
                    <td>{d.position}</td>
                    <td>{d.fromClubName} <span className="arrow">→</span> <b>{d.toClubName}</b></td>
                    <td>{formatMoney(d.fee)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

