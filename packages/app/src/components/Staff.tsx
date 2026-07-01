import { useState } from 'react';
import { myClub, type GameState, type ActionOutcome } from '../game.js';
import { upgradeCost, STAFF_MAX, formatMoney, type StaffKind } from '@soccer-tycoon/engine';

interface Props {
  game: GameState;
  onUpgrade: (kind: string) => ActionOutcome;
}

const STAFF: { key: StaffKind; label: string; icon: string; effect: string }[] = [
  { key: 'coaching', label: '코칭', icon: '📋', effect: '선수 성장률 향상 (유망주 육성)' },
  { key: 'medical', label: '의료', icon: '🩺', effect: '부상 확률·기간 감소, 컨디션 회복 향상' },
  { key: 'scouting', label: '스카우팅', icon: '🔍', effect: '이적 매물 잠재력 정보 정확도 향상' },
  { key: 'youth', label: '유스', icon: '🎓', effect: '매 시즌 아카데미 유망주 배출 수·잠재력 향상' },
];

export function Staff({ game, onUpgrade }: Props) {
  const club = myClub(game);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const staffWage =
    (club.staff.coaching + club.staff.medical + club.staff.scouting + club.staff.youth) * 600;

  return (
    <div className="staff">
      <div className="staff-head">
        <div>
          <span className="muted">보유 자금</span>{' '}
          <b className="budget">{formatMoney(club.finance.balance)}</b>
          <span className="muted"> · 스태프 연봉 {formatMoney(staffWage)}/시즌</span>
        </div>
        {msg && <span className={msg.ok ? 'toast ok' : 'toast err'}>{msg.text}</span>}
      </div>

      <div className="staff-cards">
        {STAFF.map((s) => {
          const level = club.staff[s.key];
          const maxed = level >= STAFF_MAX;
          const cost = maxed ? 0 : upgradeCost(level);
          const afford = club.finance.balance >= cost;
          return (
            <div className="staff-card" key={s.key}>
              <div className="staff-icon">{s.icon}</div>
              <div className="staff-name">{s.label}</div>
              <div className="staff-level">
                Lv. <b>{level}</b> / {STAFF_MAX}
              </div>
              <div className="staff-bar">
                <div className="staff-bar-fill" style={{ width: `${(level / STAFF_MAX) * 100}%` }} />
              </div>
              <div className="staff-effect muted">{s.effect}</div>
              <button
                className="btn-advance staff-btn"
                disabled={maxed || !afford}
                onClick={() => setMsg({ ...pick(onUpgrade(s.key)) })}
              >
                {maxed ? '최고 레벨' : `업그레이드 (${formatMoney(cost)})`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function pick(o: ActionOutcome): { text: string; ok: boolean } {
  return { text: o.message, ok: o.ok };
}
