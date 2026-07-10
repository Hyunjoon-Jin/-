import { useEffect, useMemo, useRef, useState } from 'react';
import {
  computeTeamStrength, currentAbility, isInjured, isSuspended, isAvailable, lineOf, familiarityAt,
  eligibleInstructionKinds, POSITIONS, FORMATIONS, rankCaptainCandidates,
  type Club, type Tactic, type TeamStrength, type PlayerInstructionKind, type Position,
} from '@soccer-tycoon/engine';
import {
  FORMATION_NAMES, autoPickLineup, swapPlayer, pickSetPieceTaker, ensureSetPieceTaker,
  pickCaptain, ensureCaptain, pickViceCaptain, ensureViceCaptain, setPlayerInstruction,
  repairTactic, type LineupBias,
} from '../tactics.js';
import { loadCustomPresets, saveCustomPreset, deleteCustomPreset, type CustomPreset } from '../customPresets.js';
import {
  loadCustomFormations, saveCustomFormation, deleteCustomFormation, type CustomFormation,
} from '../customFormations.js';
import { loadLineupPresets, saveLineupPreset, deleteLineupPreset, type LineupPreset } from '../lineupPresets.js';
import { useModalA11y } from './useModalA11y.js';
import { FormationPitchEditor, mirrorSymmetry, OUTFIELD_POSITIONS } from './FormationPitchEditor.js';

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

/** 베스트 XI 자동 선발 성향 선택지(선수관리 개선 항목32). */
const BIAS_OPTIONS: { key: LineupBias; label: string }[] = [
  { key: 'balanced', label: '균형' },
  { key: 'attacking', label: '공격 우선' },
  { key: 'defensive', label: '수비 우선' },
];

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

  // 전술 변경 전후 전력 변화 하이라이트(선수관리 개선 항목33) — 직전 렌더의 전력을 ref에
  // 담아두고 이번 렌더의 값과 비교, 커밋 후(useEffect) 다음 비교를 위해 갱신한다.
  const prevStrengthRef = useRef<TeamStrength | null>(null);
  const strengthDiff = prevStrengthRef.current
    ? (Object.keys(strength) as (keyof TeamStrength)[]).reduce((acc, k) => {
        acc[k] = strength[k] - prevStrengthRef.current![k];
        return acc;
      }, {} as Record<keyof TeamStrength, number>)
    : null;
  useEffect(() => { prevStrengthRef.current = strength; }, [strength]);

  const [customFormations, setCustomFormations] = useState<CustomFormation[]>(() => loadCustomFormations());
  const [showFormationEditor, setShowFormationEditor] = useState(false);
  /** 복제 후 편집(선수관리 개선 항목35) — null이면 빈 4-3-3으로, 값이 있으면 해당 포메이션을
   *  초기값으로 채워 에디터를 연다. */
  const [editorSeed, setEditorSeed] = useState<{ label: string; positions: Position[]; tags: string[] } | null>(null);
  const allFormationLabels = [...FORMATION_NAMES, ...customFormations.map((f) => f.label)];
  /** 커스텀 포메이션 태그 필터(선수관리 개선 항목38) — null이면 전체 표시. */
  const [formationTagFilter, setFormationTagFilter] = useState<string | null>(null);
  const allFormationTags = [...new Set(customFormations.flatMap((f) => f.tags ?? []))];
  const visibleCustomFormations = formationTagFilter
    ? customFormations.filter((f) => (f.tags ?? []).includes(formationTagFilter))
    : customFormations;
  const [xiBias, setXiBias] = useState<LineupBias>('balanced');
  const [pickerSlotIndex, setPickerSlotIndex] = useState<number | null>(null);

  const [lineupPresets, setLineupPresets] = useState<LineupPreset[]>(() => loadLineupPresets(club.id));
  const [showSaveLineupInput, setShowSaveLineupInput] = useState(false);
  const [lineupPresetNameInput, setLineupPresetNameInput] = useState('');

  function setFormation(f: string, customPositions?: Position[], bias: LineupBias = xiBias) {
    const positions = customPositions ?? customFormations.find((cf) => cf.label === f)?.positions;
    const lineup = autoPickLineup(club, f, positions, bias);
    const captainId = pickCaptain(club, lineup);
    onChange({
      ...tactic, formation: f, lineup,
      setPieceTakerId: pickSetPieceTaker(club, lineup),
      captainId,
      viceCaptainId: pickViceCaptain(club, lineup, captainId),
    });
  }

  function handleSaveLineupPreset() {
    const label = lineupPresetNameInput.trim();
    if (!label) return;
    setLineupPresets(saveLineupPreset(club.id, label, tactic.formation, tactic.lineup));
    setLineupPresetNameInput('');
    setShowSaveLineupInput(false);
  }
  function handleDeleteLineupPreset(id: string) {
    setLineupPresets(deleteLineupPreset(club.id, id));
  }
  function handleApplyLineupPreset(preset: LineupPreset) {
    // 저장 이후 이적·방출·은퇴로 선수가 사라졌을 수 있어, repairTactic으로 빈 슬롯을
    // 현재 스쿼드 기준 베스트로 채워 넣는다(자유 포메이션도 그대로 적용).
    const repaired = repairTactic(club, { ...tactic, formation: preset.formation, lineup: preset.lineup });
    const captainId = ensureCaptain(club, repaired.lineup, tactic.captainId);
    onChange({
      ...repaired,
      captainId,
      viceCaptainId: ensureViceCaptain(club, repaired.lineup, tactic.viceCaptainId, captainId),
      setPieceTakerId: ensureSetPieceTaker(club, repaired.lineup, tactic.setPieceTakerId),
    });
  }
  function handleSaveFormation(label: string, positions: Position[], tags: string[]) {
    setCustomFormations(saveCustomFormation(label, positions, tags));
    setShowFormationEditor(false);
    setEditorSeed(null);
    // 방금 저장한 포메이션 목록은 아직 리렌더 전(state가 비동기 반영)이라, 슬롯 배열을 직접 넘긴다.
    setFormation(label, positions);
  }
  function handleDeleteFormation(id: string, label: string) {
    setCustomFormations(deleteCustomFormation(id));
    // 삭제한 포메이션을 쓰고 있었다면 기본값으로 되돌린다.
    if (tactic.formation === label) setFormation(FORMATION_NAMES[0]!);
  }
  function handleCloneFormation(cf: CustomFormation) {
    setEditorSeed({ label: `${cf.label} 사본`.slice(0, 20), positions: cf.positions, tags: cf.tags ?? [] });
    setShowFormationEditor(true);
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
    // 주장을 부주장으로 바꾸는 경우 겹치지 않도록 부주장을 다시 자동 지정한다.
    const viceCaptainId = tactic.viceCaptainId === playerId
      ? pickViceCaptain(club, tactic.lineup, playerId)
      : tactic.viceCaptainId;
    onChange({ ...tactic, captainId: playerId, viceCaptainId });
  }
  function setViceCaptain(playerId: string) {
    onChange({ ...tactic, viceCaptainId: playerId });
  }

  const setPieceCandidates = tactic.lineup
    .filter((slot) => lineOf(slot.position) === 'ATT' || lineOf(slot.position) === 'MID')
    .map((slot) => byId.get(slot.playerId))
    .filter((p): p is NonNullable<typeof p> => p !== undefined)
    .sort((a, b) => b.attributes.setPiece - a.attributes.setPiece);

  // 주장 추천 점수(신규 개선 항목 16) 내림차순 — 리더십을 중심으로 리더/다혈질 특성,
  // 소속 기간, 국가대표 경험을 반영한 종합 점수다.
  const captainRanking = rankCaptainCandidates(
    tactic.lineup
      .map((slot) => byId.get(slot.playerId))
      .filter((p): p is NonNullable<typeof p> => p !== undefined),
  );
  const captainCandidates = captainRanking
    .map((r) => ({ player: byId.get(r.playerId)!, rank: r }));

  // 부주장 후보(고도화 항목14) — 주장은 제외하고 같은 점수 공식으로 랭킹.
  const viceCaptainCandidates = captainRanking
    .filter((r) => r.playerId !== tactic.captainId)
    .map((r) => ({ player: byId.get(r.playerId)!, rank: r }));

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
          {visibleCustomFormations.map((cf) => (
            <span key={cf.id} className="chip preset-chip custom-preset-chip">
              <button
                className={`custom-preset-apply${tactic.formation === cf.label ? ' active' : ''}`}
                onClick={() => setFormation(cf.label)}
                disabled={disabled}
                title={(cf.tags ?? []).join(', ') || undefined}
              >
                ★ {cf.label}
              </button>
              <button
                className="preset-delete"
                title="복제해서 편집(선수관리 개선 항목35)"
                disabled={disabled}
                onClick={() => handleCloneFormation(cf)}
              >
                ⧉
              </button>
              <button
                className="preset-delete"
                title="이 커스텀 포메이션 삭제"
                disabled={disabled}
                onClick={() => handleDeleteFormation(cf.id, cf.label)}
              >
                ×
              </button>
            </span>
          ))}
          <button
            className="chip"
            disabled={disabled || customFormations.length >= 8}
            title={customFormations.length >= 8 ? '커스텀 포메이션은 최대 8개까지 저장할 수 있습니다.' : undefined}
            onClick={() => { setEditorSeed(null); setShowFormationEditor(true); }}
          >
            + 커스텀 포메이션
          </button>
          <button className="chip auto" onClick={() => setFormation(tactic.formation)} disabled={disabled}>
            ⟳ 베스트 XI
          </button>
        </div>
        {allFormationTags.length > 0 && (
          <div className="field-controls formation-tag-filter-row">
            <span className="label small">포메이션 태그</span>
            <button
              className={formationTagFilter === null ? 'chip small active' : 'chip small'}
              onClick={() => setFormationTagFilter(null)}
            >전체</button>
            {allFormationTags.map((t) => (
              <button
                key={t}
                className={formationTagFilter === t ? 'chip small active' : 'chip small'}
                onClick={() => setFormationTagFilter((cur) => (cur === t ? null : t))}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        <div className="field-controls xi-bias-row">
          <span className="label small">베스트 XI 성향</span>
          {BIAS_OPTIONS.map((b) => (
            <button
              key={b.key}
              className={xiBias === b.key ? 'chip small active' : 'chip small'}
              disabled={disabled}
              onClick={() => setXiBias(b.key)}
              title="라인 간에 실력이 겹치는 자원이 있을 때 어느 라인에 먼저 배정할지 우선순위를 바꿉니다."
            >
              {b.label}
            </button>
          ))}
        </div>

        <div className="field-controls lineup-preset-row">
          <span className="label small">라인업 프리셋</span>
          {lineupPresets.map((p) => (
            <span key={p.id} className="chip preset-chip custom-preset-chip">
              <button
                className="custom-preset-apply"
                title={`${p.label} (${p.formation})`}
                disabled={disabled}
                onClick={() => handleApplyLineupPreset(p)}
              >
                ★ {p.label}
              </button>
              <button
                className="preset-delete"
                title="이 라인업 프리셋 삭제"
                disabled={disabled}
                onClick={() => handleDeleteLineupPreset(p.id)}
              >
                ×
              </button>
            </span>
          ))}
          {!showSaveLineupInput ? (
            <button
              className="chip small"
              disabled={disabled || lineupPresets.length >= 10}
              title={lineupPresets.length >= 10 ? '라인업 프리셋은 최대 10개까지 저장할 수 있습니다.' : undefined}
              onClick={() => setShowSaveLineupInput(true)}
            >
              + 현재 라인업 저장
            </button>
          ) : (
            <span className="preset-save-row">
              <input
                className="preset-name-input"
                type="text"
                maxLength={20}
                placeholder="프리셋 이름"
                value={lineupPresetNameInput}
                onChange={(e) => setLineupPresetNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveLineupPreset();
                  if (e.key === 'Escape') setShowSaveLineupInput(false);
                }}
                autoFocus
              />
              <button className="btn-small" onClick={handleSaveLineupPreset} disabled={!lineupPresetNameInput.trim()}>저장</button>
              <button className="btn-small" onClick={() => { setShowSaveLineupInput(false); setLineupPresetNameInput(''); }}>취소</button>
            </span>
          )}
        </div>

        {showFormationEditor && (
          <FormationEditorModal
            existingLabels={allFormationLabels}
            seed={editorSeed}
            onSave={handleSaveFormation}
            onClose={() => { setShowFormationEditor(false); setEditorSeed(null); }}
          />
        )}

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
                    <button
                      className="slot-player-btn"
                      disabled={disabled}
                      onClick={() => setPickerSlotIndex(i)}
                    >
                      {p ? (
                        <>
                          {mark(p)}
                          {p.id === tactic.captainId ? '(C) ' : p.id === tactic.viceCaptainId ? '(VC) ' : ''}
                          {p.name}
                        </>
                      ) : '(선수 없음)'}
                    </button>
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

      {pickerSlotIndex !== null && (
        <SlotPickerModal
          club={club}
          tactic={tactic}
          slotIndex={pickerSlotIndex}
          onClose={() => setPickerSlotIndex(null)}
          onPick={(playerId) => {
            const next = swapPlayer(tactic, pickerSlotIndex, playerId);
            const captainId = ensureCaptain(club, next.lineup, next.captainId);
            onChange({
              ...next,
              setPieceTakerId: ensureSetPieceTaker(club, next.lineup, next.setPieceTakerId),
              captainId,
              viceCaptainId: ensureViceCaptain(club, next.lineup, next.viceCaptainId, captainId),
            });
            setPickerSlotIndex(null);
          }}
        />
      )}

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
                {captainCandidates.map(({ player: p, rank }) => (
                  <option key={p.id} value={p.id}>
                    {p.id === captainCandidates[0]!.player.id ? '⭐ ' : ''}
                    {p.name}{rank.isLeaderTrait ? ' ★리더' : ''}{rank.isHothead ? ' ⚠️다혈질' : ''} (리더십 {p.attributes.leadership})
                  </option>
                ))}
              </select>
              <p className="muted small">
                ⭐ 표시가 추천 1순위입니다(리더십·리더 특성·소속 기간·국가대표 경험 종합).
                주장이 결장하면 팀 전체 사기에 소폭 페널티가 붙습니다.
              </p>
            </>
          )}
        </div>

        <div className="panel">
          <h3>부주장</h3>
          {viceCaptainCandidates.length === 0 ? (
            <p className="muted small">지정할 수 있는 선수가 없습니다.</p>
          ) : (
            <>
              <select
                className="setpiece-select"
                value={tactic.viceCaptainId ?? ''}
                disabled={disabled}
                onChange={(e) => setViceCaptain(e.target.value)}
              >
                {viceCaptainCandidates.map(({ player: p, rank }) => (
                  <option key={p.id} value={p.id}>
                    {p.id === viceCaptainCandidates[0]!.player.id ? '⭐ ' : ''}
                    {p.name}{rank.isLeaderTrait ? ' ★리더' : ''}{rank.isHothead ? ' ⚠️다혈질' : ''} (리더십 {p.attributes.leadership})
                  </option>
                ))}
              </select>
              <p className="muted small">
                주장이 결장한 날 라인업에 있으면 완장을 대신 차 사기 페널티가 발생하지 않습니다(자동 승계).
              </p>
            </>
          )}
        </div>

        <div className="panel">
          <h3>팀 전력 (현재 라인업)</h3>
          {STRENGTH_LABELS.map(({ key, label }) => {
            const d = strengthDiff?.[key] ?? 0;
            return (
              <div className="bar-row" key={key}>
                <span className="bar-label">{label}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${Math.min(100, strength[key])}%` }} />
                </div>
                <span className="bar-val">{strength[key].toFixed(0)}</span>
                {Math.abs(d) >= 0.5 && (
                  <span className={`strength-diff ${d > 0 ? 'up' : 'down'}`}>
                    {d > 0 ? '▲' : '▼'}{Math.abs(d).toFixed(1)}
                  </span>
                )}
              </div>
            );
          })}
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

/**
 * 슬롯 선수 선택 팝업(선수관리 개선 항목26/29) — select 드롭다운 대신 카드형 목록으로,
 * 각 후보의 이 포지션 적합도(숙련도 기반 %)를 함께 보여줘 드롭다운보다 한눈에 비교할 수
 * 있게 한다. 이미 다른 슬롯에 있는 선수를 고르면 두 슬롯이 맞교환된다(swapPlayer와 동일).
 */
function SlotPickerModal({
  club, tactic, slotIndex, onClose, onPick,
}: {
  club: Club; tactic: Tactic; slotIndex: number; onClose: () => void; onPick: (playerId: string) => void;
}) {
  const slot = tactic.lineup[slotIndex]!;
  const [search, setSearch] = useState('');
  const ref = useModalA11y<HTMLDivElement>(onClose);

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return club.players
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .map((p) => ({
        player: p,
        fit: p.position === slot.position ? 1 : familiarityAt(p, slot.position),
        otherSlot: tactic.lineup.findIndex((s) => s.playerId === p.id),
      }))
      .sort((a, b) => (b.fit - a.fit) || (currentAbility(b.player) - currentAbility(a.player)));
  }, [club.players, search, slot.position, tactic.lineup]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal slot-picker-modal" role="dialog" aria-modal="true"
        aria-label={`${slot.position} 슬롯 선수 선택`} tabIndex={-1} ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{slot.position} 슬롯 — 선수 선택</h2>
          <button className="btn-ghost" onClick={onClose}>닫기 ✕</button>
        </div>
        <input
          className="search" placeholder="선수 이름 검색…" aria-label="선수 이름 검색"
          value={search} onChange={(e) => setSearch(e.target.value)} autoFocus
        />
        <ul className="slot-picker-list">
          {candidates.map(({ player: p, fit, otherSlot }) => (
            <li key={p.id} className={p.id === slot.playerId ? 'slot-picker-row current' : 'slot-picker-row'}>
              <button onClick={() => onPick(p.id)}>
                <span className="spr-name">
                  {isInjured(p) ? '🤕 ' : isSuspended(p) ? '🟥 ' : ''}
                  {p.id === tactic.captainId ? '(C) ' : p.id === tactic.viceCaptainId ? '(VC) ' : ''}
                  {p.name}
                </span>
                <span className="spr-pos muted small">{p.position}</span>
                <span className="spr-ca">CA {currentAbility(p).toFixed(0)}</span>
                <span className={`spr-fit ${fit >= 0.8 ? 'good' : fit >= 0.4 ? 'mid' : 'low'}`}>
                  적합 {Math.round(fit * 100)}%
                </span>
                {otherSlot >= 0 && otherSlot !== slotIndex && (
                  <span className="muted small">(슬롯 {otherSlot + 1}과 교환)</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** GK를 제외한 슬롯에 배치 가능한 포지션(커스텀 포메이션 에디터, F14). */
/**
 * 커스텀 포메이션 에디터(F14) — 4개 프리셋 외에 5·6번째 포메이션을 직접 정의한다.
 * 슬롯 1은 항상 GK로 고정해, "정확히 11명·GK 1명" 불변식을 UI 구조로 강제한다.
 */
const FORMATION_TAG_OPTIONS = ['공격형', '수비형', '역습형', '점유형', '균형'];

function FormationEditorModal({
  existingLabels, seed, onSave, onClose,
}: {
  existingLabels: string[];
  /** 복제 후 편집(항목35) 시 채워 넣을 초기값. null이면 기본 4-3-3에서 새로 시작. */
  seed: { label: string; positions: Position[]; tags: string[] } | null;
  onSave: (label: string, positions: Position[], tags: string[]) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(seed?.label ?? '');
  const [outfield, setOutfield] = useState<Position[]>(() => (seed?.positions ?? FORMATIONS['4-3-3']!).slice(1));
  const [tags, setTags] = useState<string[]>(seed?.tags ?? []);
  const ref = useModalA11y<HTMLDivElement>(onClose);

  const trimmedLabel = label.trim();
  const duplicate = trimmedLabel.length > 0 && existingLabels.includes(trimmedLabel);
  const canSave = trimmedLabel.length > 0 && !duplicate;

  function setSlot(i: number, pos: Position) {
    setOutfield((prev) => prev.map((p, j) => (j === i ? pos : p)));
  }
  function toggleTag(t: string) {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  // 포메이션 밸런스 실시간 미리보기(항목36) — 실제 선수 능력치가 아직 없으니, 슬롯이
  // 어느 라인(수비/미드/공격)에 몇 개 배정됐는지 구조적 비율로 보여준다.
  const defCount = outfield.filter((p) => lineOf(p) === 'DEF').length;
  const midCount = outfield.filter((p) => lineOf(p) === 'MID').length;
  const attCount = outfield.filter((p) => lineOf(p) === 'ATT').length;
  const total = outfield.length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal formation-editor-modal" role="dialog" aria-modal="true"
        aria-label="커스텀 포메이션 만들기" tabIndex={-1} ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>커스텀 포메이션 만들기</h2>
          <button className="btn-ghost" onClick={onClose}>닫기 ✕</button>
        </div>
        <label className="loan-field">
          <span>이름</span>
          <input
            type="text" maxLength={20} placeholder="예: 박스형 스리백"
            value={label} onChange={(e) => setLabel(e.target.value)} autoFocus
          />
        </label>
        {duplicate && <p className="muted small formation-editor-warning">이미 있는 이름입니다. 다른 이름을 입력하세요.</p>}

        <div className="formation-editor-body">
          <div>
            <FormationPitchEditor positions={['GK', ...outfield]} onChange={setSlot} />
            <p className="muted small formation-editor-hint">점을 드래그해서 위치를 바꾸세요. 가장 가까운 포지션으로 스냅됩니다.</p>
            <button
              className="chip small"
              type="button"
              onClick={() => setOutfield((prev) => mirrorSymmetry(prev))}
              title="좌우 위/아래 슬롯을 짝지어 역할을 거울상으로 맞춥니다(항목37)"
            >
              ⇋ 좌우 대칭 맞춤
            </button>
          </div>
          <div className="formation-editor-side">
            <div className="formation-balance-row">
              <span className="label small">라인 구성</span>
              <div className="formation-balance-bar">
                {defCount > 0 && <div className="fb-segment def" style={{ flexGrow: defCount }}>수비 {defCount}</div>}
                {midCount > 0 && <div className="fb-segment mid" style={{ flexGrow: midCount }}>미드 {midCount}</div>}
                {attCount > 0 && <div className="fb-segment att" style={{ flexGrow: attCount }}>공격 {attCount}</div>}
              </div>
              <span className="muted small">GK 1 + 수비 {defCount} + 미드 {midCount} + 공격 {attCount} = {total + 1}</span>
            </div>
            <div className="formation-editor-grid formation-editor-grid-compact">
              {outfield.map((pos, i) => (
                <div className="formation-slot" key={i}>
                  <span className="formation-slot-label">슬롯 {i + 2}</span>
                  <select value={pos} onChange={(e) => setSlot(i, e.target.value as Position)}>
                    {OUTFIELD_POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="formation-tag-row">
              <span className="label small">태그(목록 필터용, 항목38)</span>
              {FORMATION_TAG_OPTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={tags.includes(t) ? 'chip small active' : 'chip small'}
                  onClick={() => toggleTag(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="confirm-actions">
          <button className="btn-ghost" onClick={onClose}>취소</button>
          <button
            className="btn-advance"
            disabled={!canSave}
            onClick={() => onSave(trimmedLabel, ['GK', ...outfield], tags)}
          >
            저장
          </button>
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
