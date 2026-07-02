import { useState } from 'react';
import {
  TECHNICAL_ATTRS, MENTAL_ATTRS, PHYSICAL_ATTRS, GOALKEEPING_ATTRS,
  TRAINING_FOCUSES, TRAINING_LABELS, TRAIT_LABELS, TRAIT_DESC,
  currentAbility, marketValue, playerDerived, isInjured, isSuspended,
  formatMoney, type AttrKey, type Player, type DerivedRatings, type TrainingFocus,
} from '@soccer-tycoon/engine';

function moraleLabel(m: number): { text: string; cls: string } {
  if (m >= 0.65) return { text: '😀 만족', cls: 'cond-good' };
  if (m >= 0.4) return { text: '😐 보통', cls: '' };
  return { text: '😠 불만', cls: 'injury' };
}

const ATTR_LABELS: Record<AttrKey, string> = {
  finishing: '결정력', shooting: '슈팅력', passing: '패스', crossing: '크로스',
  dribbling: '드리블', firstTouch: '퍼스트터치', technique: '기술', tackling: '태클',
  marking: '마크', heading: '헤딩', setPiece: '세트피스',
  vision: '시야', composure: '침착성', decisions: '판단력', anticipation: '예측',
  offTheBall: '오프더볼', positioning: '위치선정', concentration: '집중력', teamwork: '팀워크',
  workRate: '활동량', aggression: '적극성', bravery: '대담성', leadership: '리더십',
  pace: '속도', acceleration: '가속력', stamina: '스태미너', strength: '몸싸움',
  agility: '민첩성', balance: '밸런스', jumping: '점프', naturalFitness: '자연회복',
  reflexes: '반응속도', handling: '핸들링', oneOnOne: '일대일', aerialReach: '공중장악',
  goalkicks: '골킥/배급',
};

const DERIVED_LABELS: { key: keyof DerivedRatings; label: string }[] = [
  { key: 'attack', label: '공격' }, { key: 'creation', label: '창출' },
  { key: 'midfield', label: '중원' }, { key: 'defense', label: '수비' },
  { key: 'physical', label: '신체' }, { key: 'aerial', label: '공중' },
  { key: 'gk', label: '골키핑' },
];

function pickOut(o: { ok: boolean; message: string }): { text: string; ok: boolean } {
  return { text: o.message, ok: o.ok };
}

function attrClass(v: number): string {
  return v >= 15 ? 'attr-hi' : v >= 10 ? 'attr-mid' : 'attr-lo';
}

function statusBadge(p: Player): { text: string; cls: string } {
  if (isInjured(p)) return { text: `🤕 ${p.injuryName ?? '부상'} ${p.injuryMatches}경기`, cls: 'injury' };
  if (isSuspended(p)) return { text: `🟥 출전정지 ${p.suspensionMatches}경기`, cls: 'suspended' };
  return { text: `컨디션 ${Math.round(p.condition * 100)}%`, cls: 'cond-good' };
}

interface Props {
  player: Player;
  onClose: () => void;
  /** 내 선수면 훈련 포커스 설정 가능. */
  onSetFocus?: (focus: TrainingFocus) => void;
  /** 내 선수면 재계약 가능. */
  onRenew?: () => { ok: boolean; message: string };
}

export function PlayerDetail({ player, onClose, onSetFocus, onRenew }: Props) {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const ca = currentAbility(player);
  const derived = playerDerived(player, player.position);
  const status = statusBadge(player);
  const fam = Object.entries(player.familiarity)
    .filter(([, v]) => (v ?? 0) >= 0.5)
    .map(([pos]) => pos);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal player-detail" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{player.name}</h2>
            <div className="muted pd-sub">
              {player.position} · {player.age}세 · {player.nationality} · 계약 {player.contractYears}년
            </div>
          </div>
          <button className="btn-ghost" onClick={onClose}>닫기 ✕</button>
        </div>

        <div className="pd-meta">
          <span>CA <b>{ca.toFixed(0)}</b></span>
          <span>PA <b>{player.potential.toFixed(0)}</b></span>
          <span>가치 <b>{formatMoney(marketValue(player))}</b></span>
          <span>주급 <b>{formatMoney(player.wage)}</b></span>
          <span className={status.cls}>{status.text}</span>
          <span className={moraleLabel(player.morale).cls}>사기 {moraleLabel(player.morale).text}</span>
          <span className="muted">시즌 {player.seasonApps}경 {player.seasonGoals ?? 0}골</span>
          {((player.careerApps ?? 0) > 0 || (player.careerGoals ?? 0) > 0) && (
            <span className="muted" title="이전 시즌까지 통산 기록">통산 {player.careerApps ?? 0}경 {player.careerGoals ?? 0}골</span>
          )}
          {(player.caps ?? 0) > 0 && <span className="pd-caps" title="국가대표 A매치 출전 캡">🎽 A매치 {player.caps}경</span>}
        </div>

        {onRenew && (
          <div className="pd-renew">
            {player.contractYears <= 2 ? (
              <>
                <span className="muted">계약 만료 임박 ({player.contractYears}년) — </span>
                <button className="btn-small" onClick={() => setMsg(pickOut(onRenew()))}>재계약 (계약금 {formatMoney(player.wage * 20)})</button>
              </>
            ) : (
              <span className="muted small">계약 {player.contractYears}년 남음 — 재계약 불필요.</span>
            )}
            {msg && <span className={msg.ok ? 'toast ok' : 'toast err'}>{msg.text}</span>}
          </div>
        )}
        {(player.traits ?? []).length > 0 && (
          <div className="pd-traits">
            {(player.traits ?? []).map((t) => (
              <span key={t} className="trait-chip" title={TRAIT_DESC[t]}>★ {TRAIT_LABELS[t]}</span>
            ))}
          </div>
        )}
        <div className="pd-fam muted">가능 포지션: {fam.join(', ') || player.position}</div>

        {onSetFocus && (
          <div className="pd-training">
            <span className="muted">훈련 포커스:</span>
            <select value={player.trainingFocus} onChange={(e) => onSetFocus(e.target.value as TrainingFocus)}>
              {TRAINING_FOCUSES.map((f) => (
                <option key={f} value={f}>{TRAINING_LABELS[f]}</option>
              ))}
            </select>
            <span className="muted small">시즌 성장 시 해당 능력 그룹을 강조합니다 (성장 중인 선수).</span>
          </div>
        )}

        <GrowthChart history={player.caHistory ?? []} current={Math.round(ca)} />

        <div className="pd-cols">
          <AttrGroup title="기술" attrs={TECHNICAL_ATTRS} player={player} />
          <AttrGroup title="정신" attrs={MENTAL_ATTRS} player={player} />
          <div>
            <AttrGroup title="신체" attrs={PHYSICAL_ATTRS} player={player} />
            {player.position === 'GK' && (
              <AttrGroup title="골키핑" attrs={GOALKEEPING_ATTRS} player={player} />
            )}
          </div>
        </div>

        <div className="pd-derived">
          <h3>파생 전력</h3>
          {DERIVED_LABELS.map(({ key, label }) => (
            <div className="bar-row" key={key}>
              <span className="bar-label">{label}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${Math.min(100, derived[key])}%` }} />
              </div>
              <span className="bar-val">{derived[key].toFixed(0)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 시즌별 CA 스냅샷 + 현재 CA로 성장 곡선 스파크라인을 그린다. */
function GrowthChart({ history, current }: { history: number[]; current: number }) {
  const pts = [...history, current];
  if (pts.length < 2) {
    return (
      <div className="pd-growth">
        <h3>성장 추이 <span className="muted small">(시즌별 CA)</span></h3>
        <p className="muted small">시즌을 마치면 성장 곡선이 쌓입니다.</p>
      </div>
    );
  }
  const W = 320, H = 64, pad = 6;
  const lo = Math.min(...pts) - 2;
  const hi = Math.max(...pts) + 2;
  const span = Math.max(1, hi - lo);
  const x = (i: number) => pad + (i / (pts.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - lo) / span) * (H - pad * 2);
  const line = pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const rising = current >= pts[0]!;
  const color = rising ? '#3ddc84' : '#e0a83b';

  return (
    <div className="pd-growth">
      <h3>성장 추이 <span className="muted small">(시즌별 CA · 현재 {current})</span></h3>
      <svg width={W} height={H} className="growth-svg" role="img" aria-label="CA 성장 곡선">
        <polyline points={line} fill="none" stroke={color} strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={i === pts.length - 1 ? 3.5 : 2}
            fill={i === pts.length - 1 ? color : 'rgba(255,255,255,0.5)'} />
        ))}
      </svg>
      <div className="growth-ends muted small">
        <span>{pts[0]}</span>
        <span>최고 {Math.max(...pts)}</span>
        <span>{current}</span>
      </div>
    </div>
  );
}

function AttrGroup({
  title, attrs, player,
}: { title: string; attrs: readonly AttrKey[]; player: Player }) {
  return (
    <div className="attr-group">
      <h3>{title}</h3>
      <table className="attr-table">
        <tbody>
          {attrs.map((k) => (
            <tr key={k}>
              <td className="attr-name">{ATTR_LABELS[k]}</td>
              <td className={`attr-val ${attrClass(player.attributes[k])}`}>{player.attributes[k]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
