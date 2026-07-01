import { useMemo, useState } from 'react';
import { myClub, lastSummary, type GameState, type ActionOutcome } from '../game.js';
import {
  transferTargets, marketValue, currentAbility, formatMoney, lineOf,
  type Line, type Player,
} from '@soccer-tycoon/engine';

interface Props {
  game: GameState;
  onBuy: (playerId: string) => ActionOutcome;
  onSell: (playerId: string) => ActionOutcome;
  onRelease: (playerId: string) => ActionOutcome;
}

type LineFilter = 'ALL' | Line;
const LINE_FILTERS: { key: LineFilter; label: string }[] = [
  { key: 'ALL', label: '전체' },
  { key: 'GK', label: 'GK' },
  { key: 'DEF', label: '수비' },
  { key: 'MID', label: '미드' },
  { key: 'ATT', label: '공격' },
];

export function Transfers({ game, onBuy, onSell, onRelease }: Props) {
  // 시즌 진행 중에는 직접 이적 불가 → 지난 시즌 내역(읽기 전용)
  if (game.live) return <TransferHistory game={game} />;
  return <TransferMarket game={game} onBuy={onBuy} onSell={onSell} onRelease={onRelease} />;
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

function TransferMarket({ game, onBuy, onSell, onRelease }: Props) {
  const club = myClub(game);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [line, setLine] = useState<LineFilter>('ALL');
  const [search, setSearch] = useState('');
  const [affordableOnly, setAffordableOnly] = useState(true);

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
                  <td className="name">{t.player.name}</td>
                  <td className="muted small">{t.clubName}</td>
                  <td>{t.player.position}</td>
                  <td>{t.player.age}</td>
                  <td><b>{currentAbility(t.player).toFixed(0)}</b></td>
                  <td className="muted">{revealPotential(scouting, t.player.potential)}</td>
                  <td>{formatMoney(t.value)}</td>
                  <td>
                    <button className="btn-small"
                      disabled={t.value > budget}
                      onClick={() => act(onBuy(t.player.id))}>영입</button>
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
                  <td className="name">{p.name}</td>
                  <td>{p.position}</td>
                  <td>{p.age}</td>
                  <td><b>{currentAbility(p).toFixed(0)}</b></td>
                  <td>{formatMoney(marketValue(p))}</td>
                  <td className="sell-actions">
                    <button className="btn-small" onClick={() => act(onSell(p.id))}>판매</button>
                    <button className="btn-small danger" onClick={() => act(onRelease(p.id))}>방출</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
