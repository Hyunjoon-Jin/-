import { useMemo, useState } from 'react';
import {
  computeTeamStrength, currentAbility, isInjured, isSuspended, isAvailable, lineOf, hasTrait,
  eligibleInstructionKinds, POSITIONS,
  type Club, type Tactic, type TeamStrength, type PlayerInstructionKind, type Position,
} from '@soccer-tycoon/engine';
import {
  FORMATION_NAMES, autoPickLineup, swapPlayer, pickSetPieceTaker, ensureSetPieceTaker,
  pickCaptain, ensureCaptain, setPlayerInstruction,
} from '../tactics.js';
import { loadCustomPresets, saveCustomPreset, deleteCustomPreset, type CustomPreset } from '../customPresets.js';

interface Props {
  club: Club;
  tactic: Tactic;
  onChange: (t: Tactic) => void;
  /** 진행 중 시즌이면 라인업 잠금(다음 경기 전까지만 편집 가능하게 하려면 false). */
  disabled?: boolean;
}

const STRENGTH_LABELS: { key: keyof TeamStrength; label: string }[] = [
  { key: 'attack', label: '공격' },
  { key: 'creation', label: '창출' },
  { key: 'midfield', label: '중원' },
  { key: 'defense', label: '수비' },
  { key: 'gk', label: 'GK' },
];

type SliderKey = 'mentality' | 'tempo' | 'pressing' | 'width' | 'defensiveLine';

const INSTRUCTION_LABEL: Record<PlayerInstructionKind, string> = {
  manMark: '전담마크', cutInside: '좁혀 들어오기',
};
/** 전담마크 대상으로 지정 가능한 상대 포지션(GK 제외). */
const MARK_TARGET_POSITIONS: Position[] = POSITIONS.filter((p) => p !== 'GK');

/** 슬라이더 5개 조합 한 번에 적용하는 전술 스타일 프리셋. */
const PRESETS: { key: string; label: string; desc: string; values: Pick<Tactic, SliderKey> }[] = [
  {
    key: 'tiki', label: '티키타카', desc: '점유·짧은 패스망 위주로 상대를 지치게 한다',
    values: { mentality: 0.55, tempo: 0.35, pressing: 0.65, width: 0.35, defensiveLine: 0.6 },
  },
  {
    key: 'counter', label: '역습 축구', desc: '웅크렸다 공을 따내면 빠르게 전환한다',
    values: { mentality: 0.35, tempo: 0.75, pressing: 0.35, width: 0.55, defensiveLine: 0.3 },
  },
  {
    key: 'gegen', label: '게겐프레싱', desc: '공을 뺏기는 즉시 전방위로 강하게 압박한다',
    values: { mentality: 0.65, tempo: 0.8, pressing: 0.9, width: 0.55, defensiveLine: 0.7 },
  },
];

export function Tactics({ club, tactic, onChange, disabled }: Props) {
  const byId = useMemo(() => new Map(club.players.map((p) => [p.id, p])), [club.players]);
  const strength = useMemo(() => computeTeamStrength(club, tactic), [club, tactic]);
  // 공격 성향(공격+창출) 대 수비 성향(수비+중원)의 균형 — -100(수비 편중)~+100(공격 편중).
  const rawBalance = (strength.attack + strength.creation) - (strength.defense + strength.midfield);
  const balance = Math.round(Math.max(-100, Math.min(100, rawBalance / 2.2)));

  function setFormation(f: string) {
    const lineup = autoPickLineup(club, f);
    onChange({
      ...tactic, formation: f, lineup,
      setPieceTakerId: pickSetPieceTaker(club, lineup),
      captainId: pickCaptain(club, lineup),
    });
  }
  function setSlider(key: SliderKey, v: number) {
    onChange({ ...tactic, [key]: v });
  }
  function applyPreset(values: Pick<Tactic, SliderKey>) {
    onChange({ ...tactic, ...values });
  }
  function setSetPieceTaker(playerId: string) {
    onChange({ ...tactic, setPieceTakerId: playerId });
  }
  function setCaptain(playerId: string) {
    onChange({ ...tactic, captainId: playerId });
  }

  const setPieceCandidates = tactic.lineup
    .filter((slot) => lineOf(slot.position) === 'ATT' || lineOf(slot.position) === 'MID')
    .map((slot) => byId.get(slot.playerId))
    .filter((p): p is NonNullable<typeof p> => p !== undefined)
    .sort((a, b) => b.attributes.setPiece - a.attributes.setPiece);

  const captainCandidates = tactic.lineup
    .map((slot) => byId.get(slot.playerId))
    .filter((p): p is NonNullable<typeof p> => p !== undefined)
    .sort((a, b) => b.attributes.leadership - a.attributes.leadership);

  const [customPresets, setCustomPresets] = useState<CustomPreset[]>(() => loadCustomPresets());
  const [presetNameInput, setPresetNameInput] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  function handleSavePreset() {
    const label = presetNameInput.trim();
    if (!label) return;
    const values: Pick<Tactic, SliderKey> = {
      mentality: tactic.mentality, tempo: tactic.tempo, pressing: tactic.pressing,
      width: tactic.width, defensiveLine: tactic.defensiveLine,
    };
    setCustomPresets(saveCustomPreset(label, values));
    setPresetNameInput('');
    setShowSaveInput(false);
  }
  function handleDeletePreset(id: string) {
    setCustomPresets(deleteCustomPreset(id));
  }

  return (
    <div className="tactics">
      <div className="tactics-left">
        <div className="field-controls">
          <span className="label">포메이션</span>
          {FORMATION_NAMES.map((f) => (
            <button
              key={f}
              className={tactic.formation === f ? 'chip active' : 'chip'}
              onClick={() => setFormation(f)}
              disabled={disabled}
            >
              {f}
            </button>
          ))}
          <button className="chip auto" onClick={() => setFormation(tactic.formation)} disabled={disabled}>
            ⟳ 베스트 XI
          </button>
        </div>

        <table className="data-table lineup-table">
          <thead>
            <tr><th>슬롯</th><th>선수</th><th>CA</th><th>개인 지시</th></tr>
          </thead>
          <tbody>
            {tactic.lineup.map((slot, i) => {
              const p = byId.get(slot.playerId);
              const unavailable = p ? !isAvailable(p) : false;
              const mark = (pl: typeof club.players[number]) =>
                isInjured(pl) ? '🤕 ' : isSuspended(pl) ? '🟥 ' : '';
              const kinds = eligibleInstructionKinds(slot.position);
              return (
                <tr key={i} className={unavailable ? 'slot-injured' : ''}>
                  <td className="slot-pos">{slot.position}</td>
                  <td className="slot-player">
                    <select
                      value={slot.playerId}
                      disabled={disabled}
                      onChange={(e) => {
                        const next = swapPlayer(tactic, i, e.target.value);
                        onChange({
                          ...next,
                          setPieceTakerId: ensureSetPieceTaker(club, next.lineup, next.setPieceTakerId),
                          captainId: ensureCaptain(club, next.lineup, next.captainId),
                        });
                      }}
                    >
                      {club.players.map((pl) => (
                        <option key={pl.id} value={pl.id}>
                          {mark(pl)}{pl.id === tactic.captainId ? '(C) ' : ''}{pl.name} ({pl.position} · {currentAbility(pl).toFixed(0)})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {p && isInjured(p) ? <span className="injury">🤕{p.injuryMatches}</span>
                      : p && isSuspended(p) ? <span className="suspended">🟥{p.suspensionMatches}</span>
                      : p ? currentAbility(p).toFixed(0) : '-'}
                  </td>
                  <td className="slot-instruction">
                    {kinds.length === 0 ? (
                      <span className="muted small">—</span>
                    ) : (
                      <>
                        <select
                          className="instruction-select"
                          disabled={disabled}
                          value={slot.instruction?.kind ?? ''}
                          onChange={(e) => {
                            const kind = e.target.value as PlayerInstructionKind | '';
                            if (kind === '') { onChange(setPlayerInstruction(tactic, i, undefined)); return; }
                            if (kind === 'manMark') {
                              onChange(setPlayerInstruction(tactic, i, { kind, targetPosition: MARK_TARGET_POSITIONS[0] }));
                            } else {
                              onChange(setPlayerInstruction(tactic, i, { kind }));
                            }
                          }}
                        >
                          <option value="">지시 없음</option>
                          {kinds.map((k) => <option key={k} value={k}>{INSTRUCTION_LABEL[k]}</option>)}
                        </select>
                        {slot.instruction?.kind === 'manMark' && (
                          <select
                            className="instruction-target-select"
                            disabled={disabled}
                            value={slot.instruction.targetPosition ?? ''}
                            onChange={(e) => onChange(setPlayerInstruction(
                              tactic, i, { kind: 'manMark', targetPosition: e.target.value as Position },
                            ))}
                          >
                            {MARK_TARGET_POSITIONS.map((pos) => <option key={pos} value={pos}>{pos}</option>)}
                          </select>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="tactics-right">
        <div className="panel">
          <h3>팀 지시</h3>
          <div className="preset-row">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                className="chip preset-chip"
                title={p.desc}
                disabled={disabled}
                onClick={() => applyPreset(p.values)}
              >
                {p.label}
              </button>
            ))}
            {customPresets.map((p) => (
              <span key={p.id} className="chip preset-chip custom-preset-chip">
                <button
                  className="custom-preset-apply"
                  title={`${p.label} (저장한 전술)`}
                  disabled={disabled}
                  onClick={() => applyPreset(p.values)}
                >
                  ★ {p.label}
                </button>
                <button
                  className="preset-delete"
                  title="이 프리셋 삭제"
                  disabled={disabled}
                  onClick={() => handleDeletePreset(p.id)}
                >
                  ×
                </button>
              </span>
            ))}
            {!showSaveInput && (
              <button
                className="chip preset-save-btn"
                disabled={disabled}
                onClick={() => setShowSaveInput(true)}
              >
                + 현재 설정 저장
              </button>
            )}
          </div>
          {showSaveInput && (
            <div className="preset-save-row">
              <input
                className="preset-name-input"
                type="text"
                maxLength={20}
                placeholder="프리셋 이름"
                value={presetNameInput}
                onChange={(e) => setPresetNameInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSavePreset(); if (e.key === 'Escape') setShowSaveInput(false); }}
                autoFocus
              />
              <button className="btn-small" onClick={handleSavePreset} disabled={!presetNameInput.trim()}>저장</button>
              <button className="btn-small" onClick={() => { setShowSaveInput(false); setPresetNameInput(''); }}>취소</button>
            </div>
          )}
          <Slider label="멘탈리티" left="수비적" right="공격적"
            value={tactic.mentality} disabled={disabled}
            onChange={(v) => setSlider('mentality', v)} />
          <Slider label="템포" left="느림" right="빠름"
            value={tactic.tempo} disabled={disabled}
            onChange={(v) => setSlider('tempo', v)} />
          <Slider label="압박" left="약함" right="강함"
            value={tactic.pressing} disabled={disabled}
            onChange={(v) => setSlider('pressing', v)} />
          <Slider label="폭" left="좁게" right="넓게"
            value={tactic.width} disabled={disabled}
            onChange={(v) => setSlider('width', v)} />
          <Slider label="수비라인" left="낮게" right="높게"
            value={tactic.defensiveLine} disabled={disabled}
            onChange={(v) => setSlider('defensiveLine', v)} />
        </div>

        <div className="panel">
          <h3>세트피스 전담자</h3>
          {setPieceCandidates.length === 0 ? (
            <p className="muted small">라인업에 공격·미드필더가 없습니다.</p>
          ) : (
            <>
              <select
                className="setpiece-select"
                value={tactic.setPieceTakerId ?? ''}
                disabled={disabled}
                onChange={(e) => setSetPieceTaker(e.target.value)}
              >
                {setPieceCandidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (세트피스 {p.attributes.setPiece})
                  </option>
                ))}
              </select>
              <p className="muted small">코너킥·프리킥 상황의 상당수를 이 선수가 직접 맡습니다.</p>
            </>
          )}
        </div>

        <div className="panel">
          <h3>주장</h3>
          {captainCandidates.length === 0 ? (
            <p className="muted small">라인업이 비어 있습니다.</p>
          ) : (
            <>
              <select
                className="setpiece-select"
                value={tactic.captainId ?? ''}
                disabled={disabled}
                onChange={(e) => setCaptain(e.target.value)}
              >
                {captainCandidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{hasTrait(p, 'leader') ? ' ★리더' : ''} (리더십 {p.attributes.leadership})
                  </option>
                ))}
              </select>
              <p className="muted small">주장이 결장하면 팀 전체 사기에 소폭 페널티가 붙습니다.</p>
            </>
          )}
        </div>

        <div className="panel">
          <h3>팀 전력 (현재 라인업)</h3>
          {STRENGTH_LABELS.map(({ key, label }) => (
            <div className="bar-row" key={key}>
              <span className="bar-label">{label}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${Math.min(100, strength[key])}%` }} />
              </div>
              <span className="bar-val">{strength[key].toFixed(0)}</span>
            </div>
          ))}
          <div className="balance-row" title="공격(공격+창출) 대 수비(수비+중원) 편중도">
            <span className="bar-label">밸런스</span>
            <div className="balance-track">
              <div className="balance-mid" />
              <div
                className={`balance-fill ${balance >= 0 ? 'atk' : 'def'}`}
                style={{
                  width: `${Math.abs(balance) / 2}%`,
                  left: balance >= 0 ? '50%' : `${50 - Math.abs(balance) / 2}%`,
                }}
              />
            </div>
            <span className="bar-val">{balance > 0 ? `공격 +${balance}` : balance < 0 ? `수비 +${-balance}` : '중립'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Slider({
  label, left, right, value, onChange, disabled,
}: {
  label: string; left: string; right: string; value: number;
  onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <div className="slider">
      <div className="slider-head"><span>{label}</span><b>{Math.round(value * 100)}</b></div>
      <input
        type="range" min={0} max={1} step={0.05} value={value} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="slider-ends"><span>{left}</span><span>{right}</span></div>
    </div>
  );
}
