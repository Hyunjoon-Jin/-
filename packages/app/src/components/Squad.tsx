import { useMemo, useState } from 'react';
import {
  formatMoney, currentAbility, marketValue, isInjured, isSuspended, lineOf, MENTOR_PAIRING_MAX,
  type Club, type Player, type Line,
} from '@soccer-tycoon/engine';
import { onKeyActivate } from '../a11y.js';
import { SortableTh } from './SortableTh.js';
import { flagFor } from '../flags.js';
import { useResultToast } from '../toast.js';
import type { ActionOutcome } from '../game.js';

/** 멘토링 대상은 아직 성장 중인 유망주(엔진 MENTEE_MAX_AGE와 동일 기준)만. */
const MENTEE_MAX_AGE = 23;

function MentorPanel({ club, onAssignMentor, onClearMentor }: {
  club: Club;
  onAssignMentor: (mentorId: string, menteeId: string) => ActionOutcome;
  onClearMentor: (menteeId: string) => ActionOutcome;
}) {
  const toast = useResultToast();
  const pairings = club.mentorPairings ?? [];
  const mentees = club.players.filter((p) => p.age <= MENTEE_MAX_AGE);
  const [menteeId, setMenteeId] = useState('');
  const [mentorId, setMentorId] = useState('');
  const mentee = mentees.find((p) => p.id === menteeId);
  const mentorOptions = mentee ? club.players.filter((p) => p.id !== mentee.id && p.age > mentee.age) : [];
  const nameOf = (id: string) => club.players.find((p) => p.id === id)?.name ?? '(이적/방출됨)';

  return (
    <div className="mentor-panel">
      <h3>🧑‍🏫 멘토 페어링 <span className="muted small">({pairings.length}/{MENTOR_PAIRING_MAX})</span></h3>
      {pairings.length > 0 && (
        <ul className="mentor-list">
          {pairings.map((m) => (
            <li key={m.menteeId}>
              <b>{nameOf(m.mentorId)}</b> → {nameOf(m.menteeId)}
              <button className="btn-ghost mentor-clear-btn" onClick={() => toast(onClearMentor(m.menteeId))}>해제</button>
            </li>
          ))}
        </ul>
      )}
      <div className="mentor-form">
        <select value={menteeId} onChange={(e) => { setMenteeId(e.target.value); setMentorId(''); }}>
          <option value="">멘티(유망주) 선택…</option>
          {mentees.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.age}세, {p.position})</option>)}
        </select>
        <select value={mentorId} onChange={(e) => setMentorId(e.target.value)} disabled={!mentee}>
          <option value="">멘토 선택…</option>
          {mentorOptions.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.age}세, {p.position})</option>)}
        </select>
        <button
          className="btn-advance"
          disabled={!mentee || !mentorId}
          onClick={() => {
            const r = onAssignMentor(mentorId, menteeId);
            toast(r);
            if (r.ok) { setMenteeId(''); setMentorId(''); }
          }}
        >
          지정
        </button>
      </div>
      <p className="muted small">
        지정한 멘토는 같은 라인 자동 멘토링보다 성장 보너스가 더 큽니다. 멘토가 멘티보다 나이가
        많아야 하며, 동시에 최대 {MENTOR_PAIRING_MAX}쌍까지 지정할 수 있습니다.
      </p>
    </div>
  );
}

type SortKey = 'ca' | 'age' | 'value' | 'wage' | 'condition';
type SortDir = 1 | -1;
/** 컬럼별 기본 정렬 방향(재클릭 시 이 방향을 뒤집는다). */
const DEFAULT_DIR: Record<SortKey, SortDir> = { ca: -1, age: 1, value: -1, wage: -1, condition: 1 };

type LineFilter = 'ALL' | Line;
const LINE_FILTERS: { key: LineFilter; label: string }[] = [
  { key: 'ALL', label: '전체' },
  { key: 'GK', label: 'GK' },
  { key: 'DEF', label: '수비' },
  { key: 'MID', label: '미드' },
  { key: 'ATT', label: '공격' },
];

/** 재계약 임박 기준(renewContract가 허용하는 문턱과 동일 — 2년 이하). */
const CONTRACT_SOON = 2;

/** 복귀 직후 재부상 위험/능력치 회복 지연 중이면 작은 배지를 붙인다(공간이 좁은 표 셀용). */
function RecoveryHint({ player }: { player: Player }) {
  const risk = (player.reinjuryRiskMatches ?? 0) > 0;
  const recovering = (player.recoveryAttrMatches ?? 0) > 0
    && player.injuryBodyPart && player.injuryBodyPart !== 'general';
  if (!risk && !recovering) return null;
  return (
    <>
      {risk && (
        <span className="injury-risk" title={`재부상 위험 ${player.reinjuryRiskMatches}경기 남음`}> ⚠️</span>
      )}
      {recovering && (
        <span className="recovering" title={`능력치 회복 지연 ${player.recoveryAttrMatches}경기 남음`}> 🩹</span>
      )}
    </>
  );
}

/** 컨디션(0~1)을 색상 점 + %로. 부상은 🤕 N, 정지는 🟥 N. */
function ConditionCell({ player }: { player: Player }) {
  if (isInjured(player)) {
    return <span className="injury" title={player.injuryName}>🤕 {player.injuryMatches}</span>;
  }
  if (isSuspended(player)) {
    return <span className="suspended">🟥 {player.suspensionMatches}</span>;
  }
  const pct = Math.round(player.condition * 100);
  const cls = pct >= 80 ? 'cond-good' : pct >= 55 ? 'cond-mid' : 'cond-low';
  return (
    <span className={`cond ${cls}`}>
      {pct}%
      <RecoveryHint player={player} />
    </span>
  );
}

type SquadView = 'first' | 'reserves';

interface SquadProps {
  club: Club;
  onSelect: (p: Player) => void;
  onAssignMentor: (mentorId: string, menteeId: string) => ActionOutcome;
  onClearMentor: (menteeId: string) => ActionOutcome;
}

export function Squad({ club, onSelect, onAssignMentor, onClearMentor }: SquadProps) {
  const [view, setView] = useState<SquadView>('first');
  const [sort, setSort] = useState<SortKey>('ca');
  const [dir, setDir] = useState<SortDir>(-1);
  const [line, setLine] = useState<LineFilter>('ALL');
  const [search, setSearch] = useState('');
  const [troubledOnly, setTroubledOnly] = useState(false);
  const [contractSoonOnly, setContractSoonOnly] = useState(false);
  const reserves = club.reserves ?? [];

  function toggleSort(k: SortKey) {
    if (k === sort) { setDir((d) => (d === 1 ? -1 : 1) as SortDir); return; }
    setSort(k);
    setDir(DEFAULT_DIR[k]);
  }

  const rows = useMemo(() => {
    let list = club.players.map((p) => ({
      player: p,
      ca: currentAbility(p),
      value: marketValue(p),
    }));
    if (line !== 'ALL') list = list.filter((r) => lineOf(r.player.position) === line);
    if (troubledOnly) list = list.filter((r) => isInjured(r.player) || isSuspended(r.player));
    if (contractSoonOnly) list = list.filter((r) => r.player.contractYears <= CONTRACT_SOON);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => r.player.name.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      let cmp: number;
      switch (sort) {
        case 'age': cmp = a.player.age - b.player.age; break;
        case 'value': cmp = a.value - b.value; break;
        case 'wage': cmp = a.player.wage - b.player.wage; break;
        case 'condition': cmp = a.player.condition - b.player.condition; break;
        default: cmp = a.ca - b.ca;
      }
      return cmp * dir;
    });
    return list;
  }, [club.players, sort, dir, line, troubledOnly, contractSoonOnly, search]);

  return (
    <div className="squad">
      <div className="filters squad-view-toggle">
        <button
          className={view === 'first' ? 'chip active' : 'chip'}
          onClick={() => setView('first')}
        >1군 ({club.players.length})</button>
        <button
          className={view === 'reserves' ? 'chip active' : 'chip'}
          onClick={() => setView('reserves')}
        >리저브 ({reserves.length})</button>
      </div>

      {view === 'reserves' ? (
        reserves.length === 0 ? (
          <p className="muted">리저브 선수가 없습니다. 유스 아카데미에서 배출되면 여기에 합류합니다.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>이름</th><th>포지션</th><th>나이</th><th>CA</th><th>잠재력</th><th>국적</th>
              </tr>
            </thead>
            <tbody>
              {[...reserves].sort((a, b) => currentAbility(b) - currentAbility(a)).map((p) => (
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
                  <td className="muted">{flagFor(p.nationality)} {p.nationality}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : (
      <>
      <MentorPanel club={club} onAssignMentor={onAssignMentor} onClearMentor={onClearMentor} />
      <div className="filters">
        {LINE_FILTERS.map((f) => (
          <button
            key={f.key}
            className={line === f.key ? 'chip active' : 'chip'}
            onClick={() => setLine(f.key)}
          >{f.label}</button>
        ))}
        <button
          className={troubledOnly ? 'chip active' : 'chip'}
          onClick={() => setTroubledOnly((v) => !v)}
        >🤕 부상·정지만</button>
        <button
          className={contractSoonOnly ? 'chip active' : 'chip'}
          onClick={() => setContractSoonOnly((v) => !v)}
        >📋 재계약 임박</button>
      </div>
      <input
        className="search" placeholder="선수 이름 검색…" aria-label="선수 이름 검색"
        value={search} onChange={(e) => setSearch(e.target.value)}
      />

      {rows.length === 0 ? (
        <p className="muted">조건에 맞는 선수가 없습니다.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>번호</th>
              <th>이름</th>
              <th>포지션</th>
              <SortableTh label="나이" k="age" sort={sort} dir={dir} onClick={toggleSort} />
              <SortableTh label="CA" k="ca" sort={sort} dir={dir} onClick={toggleSort} />
              <th>잠재력</th>
              <SortableTh label="컨디션" k="condition" sort={sort} dir={dir} onClick={toggleSort} />
              <th>국적</th>
              <th>계약</th>
              <SortableTh label="가치" k="value" sort={sort} dir={dir} onClick={toggleSort} />
              <SortableTh label="주급" k="wage" sort={sort} dir={dir} onClick={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ player, ca, value }) => (
              <tr
                key={player.id}
                className="clickable"
                onClick={() => onSelect(player)}
                role="button"
                tabIndex={0}
                onKeyDown={onKeyActivate(() => onSelect(player))}
              >
                <td className="squad-number muted">{player.squadNumber ?? '-'}</td>
                <td className="name">
                  {player.name}
                  {player.loanFromClubId !== undefined && (
                    <span className="loan-badge" title="다른 구단에서 임대로 데려온 선수">🔁</span>
                  )}
                </td>
                <td><span className={`pos-chip pos-${lineOf(player.position).toLowerCase()}`}>{player.position}</span></td>
                <td>{player.age}</td>
                <td><b>{ca.toFixed(0)}</b></td>
                <td className="muted">{player.potential.toFixed(0)}</td>
                <td><ConditionCell player={player} /></td>
                <td className="muted">{flagFor(player.nationality)} {player.nationality}</td>
                <td className={player.contractYears <= CONTRACT_SOON ? 'neg' : ''}>{player.contractYears}년</td>
                <td>{formatMoney(value)}</td>
                <td className="muted">{formatMoney(player.wage)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      </>
      )}
    </div>
  );
}
