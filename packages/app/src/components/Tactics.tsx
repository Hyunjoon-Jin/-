import { useMemo } from 'react';
import {
  computeTeamStrength, currentAbility, isInjured, type Club, type Tactic, type TeamStrength,
} from '@soccer-tycoon/engine';
import { FORMATION_NAMES, autoPickLineup, swapPlayer } from '../tactics.js';

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

export function Tactics({ club, tactic, onChange, disabled }: Props) {
  const byId = useMemo(() => new Map(club.players.map((p) => [p.id, p])), [club.players]);
  const strength = useMemo(() => computeTeamStrength(club, tactic), [club, tactic]);

  function setFormation(f: string) {
    onChange({ ...tactic, formation: f, lineup: autoPickLineup(club, f) });
  }
  function setSlider(key: 'mentality' | 'tempo' | 'pressing', v: number) {
    onChange({ ...tactic, [key]: v });
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
            <tr><th>슬롯</th><th>선수</th><th>CA</th></tr>
          </thead>
          <tbody>
            {tactic.lineup.map((slot, i) => {
              const p = byId.get(slot.playerId);
              const injured = p ? isInjured(p) : false;
              return (
                <tr key={i} className={injured ? 'slot-injured' : ''}>
                  <td className="slot-pos">{slot.position}</td>
                  <td className="slot-player">
                    <select
                      value={slot.playerId}
                      disabled={disabled}
                      onChange={(e) => onChange(swapPlayer(tactic, i, e.target.value))}
                    >
                      {club.players.map((pl) => (
                        <option key={pl.id} value={pl.id}>
                          {isInjured(pl) ? '🤕 ' : ''}{pl.name} ({pl.position} · {currentAbility(pl).toFixed(0)})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{injured ? <span className="injury">🤕{p!.injuryMatches}</span> : p ? currentAbility(p).toFixed(0) : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="tactics-right">
        <div className="panel">
          <h3>팀 지시</h3>
          <Slider label="멘탈리티" left="수비적" right="공격적"
            value={tactic.mentality} disabled={disabled}
            onChange={(v) => setSlider('mentality', v)} />
          <Slider label="템포" left="느림" right="빠름"
            value={tactic.tempo} disabled={disabled}
            onChange={(v) => setSlider('tempo', v)} />
          <Slider label="압박" left="약함" right="강함"
            value={tactic.pressing} disabled={disabled}
            onChange={(v) => setSlider('pressing', v)} />
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
