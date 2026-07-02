import { useMemo, useState } from 'react';
import { myClub, lastSummary, type GameState, type ActionOutcome } from '../game.js';
import {
  transferTargets, marketValue, currentAbility, formatMoney, lineOf, buildScoutingReport,
  type Line, type Player, type OfferEvaluation, type TransferTarget, type SellOffer,
} from '@soccer-tycoon/engine';
import { ScoutingSummary } from './PlayerDetail.js';

interface Props {
  game: GameState;
  onNegotiate: (playerId: string, offer: number) => OfferEvaluation;
  onBuyAt: (playerId: string, fee: number) => ActionOutcome;
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

export function Transfers(props: Props) {
  // 시즌 진행 중에는 직접 이적 불가 → 지난 시즌 내역(읽기 전용)
  if (props.game.live) return <TransferHistory game={props.game} />;
  return <TransferMarket {...props} />;
}

/** 스카우팅 레벨에 따라 매물 잠재력 공개 정도가 달라진다. */
function revealPotential(scouting: number, potential: number): string {
  if (scouting >= 15) return potential.toFixed(0);
  if (scouting >= 8) {
    const band = 12 - Math.round((scouting - 8) * 1.2); // 8→12, 14→5 폭
    const lo = Math.max(0, Math.round(potential - band));
    const hi = Math.round(potential + band);
    return `${lo}~${hi}`;
  }
  return '?';
}

function TransferMarket({ game, onNegotiate, onBuyAt, onOffers, onAcceptSell, onRelease, onSelect }: Props) {
  const club = myClub(game);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [line, setLine] = useState<LineFilter>('ALL');
  const [search, setSearch] = useState('');
  const [affordableOnly, setAffordableOnly] = useState(true);
  const [negotiating, setNegotiating] = useState<TransferTarget | null>(null);
  const [selling, setSelling] = useState<Player | null>(null);

  const budget = club.finance.transferBudget;
  const scouting = club.staff.scouting;

  const targets = useMemo(() => {
    let list = transferTargets(game.clubs, game.myClubId);
    if (line !== 'ALL') list = list.filter((t) => lineOf(t.player.position) === line);
    if (affordableOnly) list = list.filter((t) => t.value <= budget);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((t) => t.player.name.toLowerCase().includes(q));
    }
    list.sort((a, b) => currentAbility(b.player) - currentAbility(a.player));
    return list.slice(0, 40);
  }, [game.clubs, game.myClubId, line, affordableOnly, search, budget]);

  function act(outcome: ActionOutcome) {
    setMsg({ text: outcome.message, ok: outcome.ok });
  }

  return (
    <div className="market">
      <div className="market-head">
        <div>
          <span className="muted">이적 예산</span>{' '}
          <b className="budget">{formatMoney(budget)}</b>
          <span className="muted"> · 스쿼드 {club.players.length}명</span>
        </div>
        {msg && <span className={msg.ok ? 'toast ok' : 'toast err'}>{msg.text}</span>}
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
          <input className="search" placeholder="선수 이름 검색…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <table className="data-table compact">
            <thead>
              <tr>
                <th>선수</th><th>구단</th><th>P</th><th>나이</th><th>CA</th>
                <th title={`스카우팅 Lv.${scouting}`}>잠재</th><th>가치</th><th></th>
              </tr>
            </thead>
            <tbody>
              {targets.map((t) => (
                <tr key={t.player.id}>
                  <td className="name link" onClick={() => onSelect(t.player)}>{t.player.name}</td>
                  <td className="muted small">{t.clubName}</td>
                  <td>{t.player.position}</td>
                  <td>{t.player.age}</td>
                  <td><b>{currentAbility(t.player).toFixed(0)}</b></td>
                  <td className="muted">{revealPotential(scouting, t.player.potential)}</td>
                  <td>{formatMoney(t.value)}</td>
                  <td>
                    <button className="btn-small"
                      onClick={() => { setMsg(null); setNegotiating(t); }}>협상</button>
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
              <tr><th>선수</th><th>P</th><th>나이</th><th>CA</th><th>가치</th><th></th></tr>
            </thead>
            <tbody>
              {[...club.players].sort((a, b) => currentAbility(b) - currentAbility(a)).map((p: Player) => (
                <tr key={p.id}>
                  <td className="name link" onClick={() => onSelect(p)}>{p.name}</td>
                  <td>{p.position}</td>
                  <td>{p.age}</td>
                  <td><b>{currentAbility(p).toFixed(0)}</b></td>
                  <td>{formatMoney(marketValue(p))}</td>
                  <td className="sell-actions">
                    <button className="btn-small" onClick={() => { setMsg(null); setSelling(p); }}>판매</button>
                    <button className="btn-small danger" onClick={() => act(onRelease(p.id))}>방출</button>
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
          onNegotiate={onNegotiate}
          onBuyAt={onBuyAt}
          onResult={(m) => { setMsg(m); setNegotiating(null); }}
          onClose={() => setNegotiating(null)}
        />
      )}
      {selling && (
        <SellModal
          player={selling}
          offers={onOffers(selling.id)}
          onAcceptSell={onAcceptSell}
          onResult={(m) => { setMsg(m); setSelling(null); }}
          onClose={() => setSelling(null)}
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
  const accept = (buyerId: string) => {
    const r = onAcceptSell(player.id, buyerId);
    onResult({ text: r.message, ok: r.ok });
  };
  const value = marketValue(player);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal negotiate" onClick={(e) => e.stopPropagation()}>
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
                    <td><button className="btn-small" onClick={() => accept(o.clubId)}>수락</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

function NegotiationModal({
  target, budget, scouting, onNegotiate, onBuyAt, onResult, onClose,
}: {
  target: TransferTarget;
  budget: number;
  scouting: number;
  onNegotiate: (playerId: string, offer: number) => OfferEvaluation;
  onBuyAt: (playerId: string, fee: number) => ActionOutcome;
  onResult: (m: Msg) => void;
  onClose: () => void;
}) {
  const { player, value } = target;
  const [ev, setEv] = useState<OfferEvaluation | null>(null);

  const offer = (amount: number) => {
    const r = onNegotiate(player.id, amount);
    if (r.ok && r.outcome === 'accepted') {
      const bought = onBuyAt(player.id, amount);
      onResult({ text: bought.message, ok: bought.ok });
      return;
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal negotiate" onClick={(e) => e.stopPropagation()}>
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
        </div>

        {ev && !ev.ok && <p className="toast err">{ev.reason}</p>}
        {ev?.outcome === 'rejected' && (
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
                disabled={amount > budget}
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
