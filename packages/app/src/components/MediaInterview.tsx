import type { MediaEvent } from '../game.js';
import { MEDIA_TONE_STYLE, type MediaTone, type ManagerPersona } from '@soccer-tycoon/engine';

const PERSONA_LABEL: Record<Exclude<ManagerPersona, 'neutral'>, string> = {
  bold: '거침없는 승부사', humble: '신중한 리더',
};

const QUESTION: Record<MediaEvent['kind'], string> = {
  win: '오늘 승리 비결이 뭐라고 생각하십니까?',
  loss: '오늘 패배 원인이 무엇이라고 보십니까?',
  draw: '무승부로 끝난 결과, 만족하십니까?',
};

const TONE_LABEL: Record<MediaTone, string> = {
  confident: '"우리 실력대로 이긴 겁니다"',
  humble: '"운도 따랐고, 선수들이 잘해줬습니다"',
  accountable: '"제 전술 판단 미스였습니다"',
  blamePlayers: '"선수들 집중력이 부족했습니다"',
  blameRef: '"석연치 않은 판정이 있었습니다"',
  satisfied: '"이 정도면 나쁘지 않은 결과입니다"',
  frustrated: '"이겼어야 할 경기를 놓쳤습니다"',
};

const RESULT_LABEL: Record<MediaEvent['kind'], string> = { win: '승', draw: '무', loss: '패' };

export function MediaInterview({
  event, persona, onRespond, onDismiss,
}: {
  event: MediaEvent;
  /** 이미 굳어진 감독 이미지(있으면 같은 성향의 답변에 추천 표시). */
  persona: ManagerPersona;
  onRespond: (tone: MediaTone) => void;
  onDismiss: () => void;
}) {
  const homeScore = event.home ? event.score[0] : event.score[1];
  const awayScore = event.home ? event.score[1] : event.score[0];
  return (
    <div className="modal-backdrop">
      <div className="modal media-modal">
        <div className="modal-head">
          <h2>📰 경기 후 인터뷰</h2>
        </div>
        <p className="muted">
          <b>{event.myClubName}</b> {homeScore} : {awayScore} <b>{event.oppName}</b>
          {' '}<span className={event.kind === 'win' ? 'pos' : event.kind === 'loss' ? 'neg' : ''}>
            ({RESULT_LABEL[event.kind]})
          </span>
        </p>
        <p className="media-question">"{QUESTION[event.kind]}"</p>
        {persona !== 'neutral' && (
          <p className="muted small media-persona-hint">
            🎭 지금까지의 답변으로 <b>"{PERSONA_LABEL[persona]}"</b> 이미지가 굳어졌습니다 — 같은 성향의 답변에 추천(★) 표시.
          </p>
        )}
        <div className="media-options">
          {event.options.map((o) => {
            const onBrand = persona !== 'neutral' && MEDIA_TONE_STYLE[o.tone] === persona;
            return (
              <button
                key={o.tone}
                className={onBrand ? 'btn-ghost media-opt on-brand' : 'btn-ghost media-opt'}
                onClick={() => onRespond(o.tone)}
              >
                <span className="media-opt-text">
                  {onBrand && <span className="media-opt-star" title="지금 이미지에 맞는 답변">★</span>}
                  {TONE_LABEL[o.tone]}
                </span>
                <span className="media-opt-effect muted small">
                  사기 {o.moraleDelta >= 0 ? '+' : ''}{Math.round(o.moraleDelta * 100)}
                  {' · '}신뢰도 {o.confidenceDelta >= 0 ? '+' : ''}{o.confidenceDelta}
                </span>
              </button>
            );
          })}
        </div>
        <button className="btn-ghost media-skip" onClick={onDismiss}>노코멘트</button>
      </div>
    </div>
  );
}
