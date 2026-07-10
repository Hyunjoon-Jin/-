import { useMemo, useState } from 'react';
import {
  formatMoney, currentAbility, marketValue, isInjured, isSuspended, lineOf, MENTOR_PAIRING_MAX, hasTrait,
  ROTATION_WARNING_THRESHOLD, TRAINING_FOCUSES, TRAINING_LABELS, TRAIT_LABELS,
  type Club, type Player, type Line, type TrainingFocus,
} from '@soccer-tycoon/engine';
import { onKeyActivate } from '../a11y.js';
import { SortableTh } from './SortableTh.js';
import { flagFor } from '../flags.js';
import { useResultToast, useToast } from '../toast.js';
import { PlayerCompareModal } from './PlayerCompareModal.js';
import type { ActionOutcome } from '../game.js';
import { RELEASE_TAG, LOAN_REVIEW_TAG } from '../playerTags.js';
import {
  loadSquadViewSettings, saveSquadViewSettings, OPTIONAL_COLUMNS,
  type SquadViewSettings, type SquadDensity, type SquadViewMode,
} from '../squadViewSettings.js';
import {
  loadSquadFilterPresets, saveSquadFilterPreset, deleteSquadFilterPreset, type SquadFilterPreset,
} from '../squadFilterPresets.js';

/** 멘토링 대상은 아직 성장 중인 유망주(엔진 MENTEE_MAX_AGE와 동일 기준)만. */
const MENTEE_MAX_AGE = 23;

/** "로"/"으로" 조사 선택 — 받침 없음(index 0) 또는 ㄹ받침(index 8)이면 "로", 그 외는 "으로". */
function roParticle(word: string): '로' | '으로' {
  const last = word.charCodeAt(word.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return '로';
  const finalIndex = (last - 0xac00) % 28;
  return finalIndex === 0 || finalIndex === 8 ? '로' : '으로';
}

/** 아직 멘토가 없는 유망주에게 최적의 미배정 멘토를 자동으로 짝지어준다(선수관리 개선
 *  항목15) — 잠재력이 높은 유망주부터, 같은 라인·높은 CA·성향 충돌(다혈질×차분함) 회피
 *  순으로 후보를 고르고, 한 멘토는 한 쌍에만 쓴다. 남은 페어링 슬롯만큼만 제안한다. */
function suggestMentorPairs(club: Club): { mentorId: string; menteeId: string }[] {
  const pairings = club.mentorPairings ?? [];
  const slotsLeft = MENTOR_PAIRING_MAX - pairings.length;
  if (slotsLeft <= 0) return [];
  const pairedMenteeIds = new Set(pairings.map((m) => m.menteeId));
  const mentees = club.players
    .filter((p) => p.age <= MENTEE_MAX_AGE && !pairedMenteeIds.has(p.id))
    .sort((a, b) => b.potential - a.potential);
  const usedMentors = new Set<string>();
  const suggestions: { mentorId: string; menteeId: string }[] = [];
  for (const mentee of mentees) {
    if (suggestions.length >= slotsLeft) break;
    const candidates = club.players
      .filter((p) => p.id !== mentee.id && p.age > mentee.age && !usedMentors.has(p.id))
      .filter((p) => !(hasTrait(p, 'hothead') && hasTrait(mentee, 'rock')))
      .sort((a, b) => {
        const sameLineA = lineOf(a.position) === lineOf(mentee.position) ? 1 : 0;
        const sameLineB = lineOf(b.position) === lineOf(mentee.position) ? 1 : 0;
        if (sameLineA !== sameLineB) return sameLineB - sameLineA;
        return currentAbility(b) - currentAbility(a);
      });
    const best = candidates[0];
    if (best) { suggestions.push({ mentorId: best.id, menteeId: mentee.id }); usedMentors.add(best.id); }
  }
  return suggestions;
}

function MentorPanel({ club, onAssignMentor, onClearMentor }: {
  club: Club;
  onAssignMentor: (mentorId: string, menteeId: string) => ActionOutcome;
  onClearMentor: (menteeId: string) => ActionOutcome;
}) {
  const toast = useResultToast();
  const showToast = useToast();
  const pairings = club.mentorPairings ?? [];
  const mentees = club.players.filter((p) => p.age <= MENTEE_MAX_AGE);
  const [menteeId, setMenteeId] = useState('');
  const [mentorId, setMentorId] = useState('');
  const mentee = mentees.find((p) => p.id === menteeId);
  const mentorOptions = mentee ? club.players.filter((p) => p.id !== mentee.id && p.age > mentee.age) : [];
  const selectedMentor = mentorOptions.find((p) => p.id === mentorId);
  const clashes = mentee !== undefined && selectedMentor !== undefined
    && hasTrait(selectedMentor, 'hothead') && hasTrait(mentee, 'rock');
  const nameOf = (id: string) => club.players.find((p) => p.id === id)?.name ?? '(이적/방출됨)';
  const suggestions = suggestMentorPairs(club);

  function applySuggestions() {
    let assigned = 0;
    for (const s of suggestions) {
      const r = onAssignMentor(s.mentorId, s.menteeId);
      if (r.ok) assigned++;
    }
    showToast(
      assigned > 0 ? `${assigned}쌍을 자동으로 배정했습니다.` : '배정할 수 있는 조합이 없습니다.',
      assigned > 0,
    );
  }

  return (
    <div className="mentor-panel">
      <h3>🧑‍🏫 멘토 페어링 <span className="muted small">({pairings.length}/{MENTOR_PAIRING_MAX})</span></h3>
      {suggestions.length > 0 && (
        <button className="btn-ghost mentor-suggest-btn" onClick={applySuggestions}>
          ⭐ 자동 추천 배정 ({suggestions.length}쌍)
        </button>
      )}
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
      {clashes && (
        <p className="mentor-clash-warning">
          ⚠️ 다혈질 멘토×차분한 멘티 조합은 성향이 맞지 않아 지정 멘토링 효과가 크게 줄어듭니다.
        </p>
      )}
      <p className="muted small">
        지정한 멘토는 같은 라인 자동 멘토링보다 성장 보너스가 더 큽니다(성향 충돌 시 예외). 멘토가
        멘티보다 나이가 많아야 하며, 동시에 최대 {MENTOR_PAIRING_MAX}쌍까지 지정할 수 있습니다.
        페어링이 유지되는 동안 멘토도 소폭 사기 보너스를 받으며, 멘티가 나이를 넘기거나 멘토를
        추월하면 자동으로 "졸업"합니다.
      </p>
    </div>
  );
}

/** 정렬 컬럼(선수관리 개선 항목5) — 등번호·사기·특성 수까지 확장. */
type SortKey = 'ca' | 'age' | 'value' | 'wage' | 'condition' | 'number' | 'morale' | 'traits';
type SortDir = 1 | -1;
/** 컬럼별 기본 정렬 방향(재클릭 시 이 방향을 뒤집는다). */
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  ca: -1, age: 1, value: -1, wage: -1, condition: 1, number: 1, morale: -1, traits: -1,
};

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

type Row = { player: Player; ca: number; value: number };

/** 복합 검색(선수관리 개선 항목4) — 이름뿐 아니라 포지션·국적·특성 라벨까지 매칭. */
function matchesSearch(player: Player, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (player.name.toLowerCase().includes(q)) return true;
  if (player.position.toLowerCase().includes(q)) return true;
  if (player.nationality.toLowerCase().includes(q)) return true;
  return player.traits.some((t) => TRAIT_LABELS[t].toLowerCase().includes(q));
}

function sortCompare(a: Row, b: Row, sort: SortKey): number {
  switch (sort) {
    case 'age': return a.player.age - b.player.age;
    case 'value': return a.value - b.value;
    case 'wage': return a.player.wage - b.player.wage;
    case 'condition': return a.player.condition - b.player.condition;
    case 'number': return (a.player.squadNumber ?? 999) - (b.player.squadNumber ?? 999);
    case 'morale': return a.player.morale - b.player.morale;
    case 'traits': return a.player.traits.length - b.player.traits.length;
    default: return a.ca - b.ca;
  }
}

interface RowFilters {
  line: LineFilter;
  search: string;
  troubledOnly?: boolean;
  contractSoonOnly?: boolean;
  sort: SortKey;
  dir: SortDir;
}

function computeRows(players: Player[], f: RowFilters): Row[] {
  let list: Row[] = players.map((p) => ({ player: p, ca: currentAbility(p), value: marketValue(p) }));
  if (f.line !== 'ALL') list = list.filter((r) => lineOf(r.player.position) === f.line);
  if (f.troubledOnly) list = list.filter((r) => isInjured(r.player) || isSuspended(r.player));
  if (f.contractSoonOnly) list = list.filter((r) => r.player.contractYears <= CONTRACT_SOON);
  if (f.search.trim()) list = list.filter((r) => matchesSearch(r.player, f.search));
  list.sort((a, b) => sortCompare(a, b, f.sort) * f.dir);
  return list;
}

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
  const needsRotation = (player.consecutiveStarts ?? 0) > ROTATION_WARNING_THRESHOLD;
  return (
    <span className={`cond ${cls}`}>
      {pct}%
      {needsRotation && (
        <span className="rotation-warning" title={`${player.consecutiveStarts}경기 연속 선발 — 로테이션이 필요합니다`}>
          {' '}🔄
        </span>
      )}
      <RecoveryHint player={player} />
    </span>
  );
}

/** 카드형 뷰(선수관리 개선 항목6)의 선수 1명 카드. */
function PlayerCard({ player, ca, value, selected, onToggleSelect, onSelect }: {
  player: Player; ca: number; value: number; selected: boolean;
  onToggleSelect: () => void; onSelect: () => void;
}) {
  return (
    <div
      className="squad-card clickable"
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={onKeyActivate(onSelect)}
    >
      <div className="squad-card-select" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" aria-label={`${player.name} 선택`} checked={selected} onChange={onToggleSelect} />
      </div>
      <div className="squad-card-header">
        <span className="squad-number muted">{player.squadNumber ?? '-'}</span>
        <span className={`pos-chip pos-${lineOf(player.position).toLowerCase()}`}>{player.position}</span>
        <b className="squad-card-name">{player.name}</b>
        {player.loanFromClubId !== undefined && <span className="loan-badge" title="임대 선수">🔁</span>}
      </div>
      <div className="squad-card-body">
        <span>나이 <b>{player.age}</b></span>
        <span>CA <b>{ca.toFixed(0)}</b></span>
        <span className="muted">잠재 {player.potential.toFixed(0)}</span>
        <ConditionCell player={player} />
      </div>
      <div className="squad-card-footer muted">
        {flagFor(player.nationality)} {player.nationality} · {player.contractYears}년 · {formatMoney(value)}
      </div>
      {(player.tags ?? []).length > 0 && (
        <div className="squad-card-tags">
          {(player.tags ?? []).map((t) => <span key={t} className="player-tag-chip">{t}</span>)}
        </div>
      )}
    </div>
  );
}

type SquadView = 'first' | 'reserves';

interface SquadProps {
  club: Club;
  onSelect: (p: Player) => void;
  onAssignMentor: (mentorId: string, menteeId: string) => ActionOutcome;
  onClearMentor: (menteeId: string) => ActionOutcome;
  /** 선택된 여러 선수의 훈련 포커스를 한 번에 지정(선수관리 개선 항목10). */
  onBulkSetTrainingFocus: (playerIds: string[], focus: TrainingFocus) => void;
  /** 선수 태그 전체를 교체(선수관리 개선 항목11/12) — 방출 후보/임대 검토 일괄 표시에 사용. */
  onSetPlayerTags: (playerId: string, tags: string[]) => void;
}

export function Squad({
  club, onSelect, onAssignMentor, onClearMentor, onBulkSetTrainingFocus, onSetPlayerTags,
}: SquadProps) {
  const [view, setView] = useState<SquadView>('first');
  const [sort, setSort] = useState<SortKey>('ca');
  const [dir, setDir] = useState<SortDir>(-1);
  const [line, setLine] = useState<LineFilter>('ALL');
  const [search, setSearch] = useState('');
  const [troubledOnly, setTroubledOnly] = useState(false);
  const [contractSoonOnly, setContractSoonOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkFocus, setBulkFocus] = useState<TrainingFocus>('balanced');
  const [compareOpen, setCompareOpen] = useState(false);
  const reserves = club.reserves ?? [];
  const showToast = useToast();

  // 리저브 탭 전용 필터/정렬/검색(선수관리 개선 항목3) — 1군 탭과 별개로 유지.
  const [reserveLine, setReserveLine] = useState<LineFilter>('ALL');
  const [reserveSearch, setReserveSearch] = useState('');
  const [reserveSort, setReserveSort] = useState<SortKey>('ca');
  const [reserveDir, setReserveDir] = useState<SortDir>(-1);

  // 목록 표시 설정(항목1/2/6) — 컬럼 표시/숨김, 밀도, 표/카드 뷰.
  const [viewSettings, setViewSettings] = useState<SquadViewSettings>(() => loadSquadViewSettings());
  const [columnsOpen, setColumnsOpen] = useState(false);

  // 필터 프리셋(항목7) — 라인·검색·부상·재계약 조합을 이름 붙여 저장.
  const [filterPresets, setFilterPresets] = useState<SquadFilterPreset[]>(() => loadSquadFilterPresets());
  const [showSavePresetInput, setShowSavePresetInput] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState('');

  function toggleSort(k: SortKey) {
    if (k === sort) { setDir((d) => (d === 1 ? -1 : 1) as SortDir); return; }
    setSort(k);
    setDir(DEFAULT_DIR[k]);
  }

  function toggleReserveSort(k: SortKey) {
    if (k === reserveSort) { setReserveDir((d) => (d === 1 ? -1 : 1) as SortDir); return; }
    setReserveSort(k);
    setReserveDir(DEFAULT_DIR[k]);
  }

  function toggleSelected(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  /** 선택된 선수 전원에게 프리셋 태그를 일괄 토글 — 전원이 이미 갖고 있으면 해제,
   *  아니면 아직 없는 선수에게만 추가(선수관리 개선 항목11/12). */
  function toggleBulkTag(tag: string, ids: string[]) {
    const targets = club.players.filter((p) => ids.includes(p.id));
    const allHave = targets.length > 0 && targets.every((p) => (p.tags ?? []).includes(tag));
    targets.forEach((p) => {
      const tags = p.tags ?? [];
      const next = allHave ? tags.filter((t) => t !== tag) : (tags.includes(tag) ? tags : [...tags, tag]);
      onSetPlayerTags(p.id, next);
    });
    showToast(allHave ? `${tag} 표시를 해제했습니다.` : `${targets.length}명을 ${tag}로 표시했습니다.`, true);
  }

  function toggleColumn(key: string) {
    setViewSettings((prev) => {
      const hiddenColumns = prev.hiddenColumns.includes(key)
        ? prev.hiddenColumns.filter((k) => k !== key)
        : [...prev.hiddenColumns, key];
      const next = { ...prev, hiddenColumns };
      saveSquadViewSettings(next);
      return next;
    });
  }

  function setDensity(density: SquadDensity) {
    setViewSettings((prev) => {
      const next = { ...prev, density };
      saveSquadViewSettings(next);
      return next;
    });
  }

  function setViewMode(viewMode: SquadViewMode) {
    setViewSettings((prev) => {
      const next = { ...prev, viewMode };
      saveSquadViewSettings(next);
      return next;
    });
  }

  const isColVisible = (key: string) => !viewSettings.hiddenColumns.includes(key);

  function applyFilterPreset(p: SquadFilterPreset) {
    setLine(p.line);
    setSearch(p.search);
    setTroubledOnly(p.troubledOnly);
    setContractSoonOnly(p.contractSoonOnly);
  }

  function handleSaveFilterPreset() {
    const label = presetNameInput.trim();
    if (!label) return;
    setFilterPresets(saveSquadFilterPreset(label, { line, search, troubledOnly, contractSoonOnly }));
    setPresetNameInput('');
    setShowSavePresetInput(false);
  }

  const rows = useMemo(
    () => computeRows(club.players, { line, search, troubledOnly, contractSoonOnly, sort, dir }),
    [club.players, sort, dir, line, troubledOnly, contractSoonOnly, search],
  );

  const reserveRows = useMemo(
    () => computeRows(reserves, { line: reserveLine, search: reserveSearch, sort: reserveSort, dir: reserveDir }),
    [reserves, reserveLine, reserveSearch, reserveSort, reserveDir],
  );

  const density = viewSettings.density;

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

        <span className="squad-toolbar-spacer" />

        <div className="density-toggle" role="group" aria-label="목록 밀도">
          <button
            className={density === 'default' ? 'chip small active' : 'chip small'}
            onClick={() => setDensity('default')}
          >보통</button>
          <button
            className={density === 'compact' ? 'chip small active' : 'chip small'}
            onClick={() => setDensity('compact')}
          >컴팩트</button>
        </div>
        {view === 'first' && (
          <div className="view-mode-toggle" role="group" aria-label="목록 형식">
            <button
              className={viewSettings.viewMode === 'table' ? 'chip small active' : 'chip small'}
              onClick={() => setViewMode('table')}
            >☰ 표</button>
            <button
              className={viewSettings.viewMode === 'cards' ? 'chip small active' : 'chip small'}
              onClick={() => setViewMode('cards')}
            >▦ 카드</button>
          </div>
        )}
        <div className="column-toggle">
          <button className="chip small" onClick={() => setColumnsOpen((v) => !v)}>⚙ 컬럼</button>
          {columnsOpen && (
            <div className="column-toggle-panel">
              {OPTIONAL_COLUMNS.map((c) => (
                <label key={c.key} className="column-toggle-item">
                  <input
                    type="checkbox"
                    checked={isColVisible(c.key)}
                    onChange={() => toggleColumn(c.key)}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {view === 'reserves' ? (
        reserves.length === 0 ? (
          <p className="muted">리저브 선수가 없습니다. 유스 아카데미에서 배출되면 여기에 합류합니다.</p>
        ) : (
          <>
          <div className="filters">
            {LINE_FILTERS.map((f) => (
              <button
                key={f.key}
                className={reserveLine === f.key ? 'chip active' : 'chip'}
                onClick={() => setReserveLine(f.key)}
              >{f.label}</button>
            ))}
          </div>
          <input
            className="search" placeholder="리저브 선수 검색…" aria-label="리저브 선수 검색"
            value={reserveSearch} onChange={(e) => setReserveSearch(e.target.value)}
          />
          {reserveRows.length === 0 ? (
            <p className="muted">조건에 맞는 선수가 없습니다.</p>
          ) : (
          <div className="table-scroll">
          <table className={density === 'compact' ? 'data-table compact' : 'data-table'}>
            <thead>
              <tr>
                <th>번호</th>
                <th>이름</th><th>포지션</th>
                <SortableTh label="나이" k="age" sort={reserveSort} dir={reserveDir} onClick={toggleReserveSort} />
                <SortableTh label="CA" k="ca" sort={reserveSort} dir={reserveDir} onClick={toggleReserveSort} />
                {isColVisible('potential') && <th>잠재력</th>}
                <SortableTh label="컨디션" k="condition" sort={reserveSort} dir={reserveDir} onClick={toggleReserveSort} />
                {isColVisible('nationality') && <th>국적</th>}
                {isColVisible('training') && <th>훈련 포커스</th>}
              </tr>
            </thead>
            <tbody>
              {reserveRows.map(({ player: p, ca }) => (
                <tr
                  key={p.id}
                  className="clickable"
                  onClick={() => onSelect(p)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={onKeyActivate(() => onSelect(p))}
                >
                  <td className="squad-number muted">{p.squadNumber ?? '-'}</td>
                  <td className="name">{p.name}</td>
                  <td><span className={`pos-chip pos-${lineOf(p.position).toLowerCase()}`}>{p.position}</span></td>
                  <td>{p.age}</td>
                  <td><b>{ca.toFixed(0)}</b></td>
                  {isColVisible('potential') && <td className="muted">{p.potential.toFixed(0)}</td>}
                  <td><ConditionCell player={p} /></td>
                  {isColVisible('nationality') && <td className="muted">{flagFor(p.nationality)} {p.nationality}</td>}
                  {isColVisible('training') && <td className="muted">{TRAINING_LABELS[p.trainingFocus]}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          )}
          </>
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
        className="search" placeholder="선수 이름·포지션·국적·특성 검색…" aria-label="선수 검색"
        value={search} onChange={(e) => setSearch(e.target.value)}
      />

      <div className="filter-preset-row">
        {filterPresets.map((p) => (
          <span key={p.id} className="chip preset-chip custom-preset-chip">
            <button
              className="custom-preset-apply"
              title={`라인 ${p.line} · 검색 "${p.search}"`}
              onClick={() => applyFilterPreset(p)}
            >
              ★ {p.label}
            </button>
            <button
              className="preset-delete"
              title="이 필터 프리셋 삭제"
              onClick={() => setFilterPresets(deleteSquadFilterPreset(p.id))}
            >
              ×
            </button>
          </span>
        ))}
        {!showSavePresetInput ? (
          <button
            className="chip small"
            disabled={filterPresets.length >= 10}
            title={filterPresets.length >= 10 ? '필터 프리셋은 최대 10개까지 저장할 수 있습니다.' : undefined}
            onClick={() => setShowSavePresetInput(true)}
          >
            + 현재 필터 저장
          </button>
        ) : (
          <span className="preset-save-form">
            <input
              className="preset-name-input"
              maxLength={20}
              placeholder="프리셋 이름"
              value={presetNameInput}
              onChange={(e) => setPresetNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveFilterPreset();
                if (e.key === 'Escape') setShowSavePresetInput(false);
              }}
              autoFocus
            />
            <button className="btn-small" onClick={handleSaveFilterPreset} disabled={!presetNameInput.trim()}>저장</button>
            <button className="btn-small" onClick={() => { setShowSavePresetInput(false); setPresetNameInput(''); }}>취소</button>
          </span>
        )}
      </div>

      {selected.size > 0 && (
        <div className="bulk-action-bar">
          <span className="bulk-count">{selected.size}명 선택됨</span>
          <select value={bulkFocus} onChange={(e) => setBulkFocus(e.target.value as TrainingFocus)}>
            {TRAINING_FOCUSES.map((f) => <option key={f} value={f}>{TRAINING_LABELS[f]}</option>)}
          </select>
          <button
            className="btn-ghost"
            onClick={() => {
              onBulkSetTrainingFocus([...selected], bulkFocus);
              const label = TRAINING_LABELS[bulkFocus];
              showToast(`${selected.size}명의 훈련 포커스를 "${label}"${roParticle(label)} 지정했습니다.`, true);
            }}
          >
            🏋 훈련 포커스 일괄 지정
          </button>
          <button className="btn-ghost" onClick={() => toggleBulkTag(RELEASE_TAG, [...selected])}>
            🏷 {RELEASE_TAG}
          </button>
          <button className="btn-ghost" onClick={() => toggleBulkTag(LOAN_REVIEW_TAG, [...selected])}>
            🏷 {LOAN_REVIEW_TAG}
          </button>
          <button className="btn-ghost" onClick={() => setCompareOpen(true)}>⚖ 비교 보기</button>
          <button className="btn-ghost" onClick={() => setSelected(new Set())}>선택 해제</button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="muted">조건에 맞는 선수가 없습니다.</p>
      ) : viewSettings.viewMode === 'cards' ? (
        <div className="squad-cards">
          {rows.map(({ player, ca, value }) => (
            <PlayerCard
              key={player.id}
              player={player}
              ca={ca}
              value={value}
              selected={selected.has(player.id)}
              onToggleSelect={() => toggleSelected(player.id)}
              onSelect={() => onSelect(player)}
            />
          ))}
        </div>
      ) : (
        <div className="table-scroll">
        <table className={density === 'compact' ? 'data-table compact' : 'data-table'}>
          <thead>
            <tr>
              <th className="select-col">
                <input
                  type="checkbox"
                  aria-label="현재 목록 전체 선택"
                  checked={rows.length > 0 && rows.every((r) => selected.has(r.player.id))}
                  onChange={(e) => {
                    setSelected(e.target.checked ? new Set(rows.map((r) => r.player.id)) : new Set());
                  }}
                />
              </th>
              <SortableTh label="번호" k="number" sort={sort} dir={dir} onClick={toggleSort} />
              <th>이름</th>
              <th>포지션</th>
              <SortableTh label="나이" k="age" sort={sort} dir={dir} onClick={toggleSort} />
              <SortableTh label="CA" k="ca" sort={sort} dir={dir} onClick={toggleSort} />
              {isColVisible('potential') && <th>잠재력</th>}
              <SortableTh label="컨디션" k="condition" sort={sort} dir={dir} onClick={toggleSort} />
              {isColVisible('nationality') && <th>국적</th>}
              {isColVisible('contract') && <th>계약</th>}
              {isColVisible('value') && <SortableTh label="가치" k="value" sort={sort} dir={dir} onClick={toggleSort} />}
              {isColVisible('wage') && <SortableTh label="주급" k="wage" sort={sort} dir={dir} onClick={toggleSort} />}
              {isColVisible('training') && <th>훈련 포커스</th>}
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
                <td className="select-col" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`${player.name} 선택`}
                    checked={selected.has(player.id)}
                    onChange={() => toggleSelected(player.id)}
                  />
                </td>
                <td className="squad-number muted">{player.squadNumber ?? '-'}</td>
                <td className="name">
                  {player.name}
                  {player.loanFromClubId !== undefined && (
                    <span className="loan-badge" title="다른 구단에서 임대로 데려온 선수">🔁</span>
                  )}
                  {(player.tags ?? []).map((t) => (
                    <span key={t} className="player-tag-chip">{t}</span>
                  ))}
                </td>
                <td><span className={`pos-chip pos-${lineOf(player.position).toLowerCase()}`}>{player.position}</span></td>
                <td>{player.age}</td>
                <td><b>{ca.toFixed(0)}</b></td>
                {isColVisible('potential') && <td className="muted">{player.potential.toFixed(0)}</td>}
                <td><ConditionCell player={player} /></td>
                {isColVisible('nationality') && <td className="muted">{flagFor(player.nationality)} {player.nationality}</td>}
                {isColVisible('contract') && (
                  <td className={player.contractYears <= CONTRACT_SOON ? 'neg' : ''}>{player.contractYears}년</td>
                )}
                {isColVisible('value') && <td>{formatMoney(value)}</td>}
                {isColVisible('wage') && <td className="muted">{formatMoney(player.wage)}</td>}
                {isColVisible('training') && <td className="muted">{TRAINING_LABELS[player.trainingFocus]}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      </>
      )}

      {compareOpen && (
        <PlayerCompareModal
          players={club.players.filter((p) => selected.has(p.id))}
          onClose={() => setCompareOpen(false)}
        />
      )}
    </div>
  );
}
