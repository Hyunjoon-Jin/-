import { useEffect, useRef, useState } from 'react';
import {
  LiveMatch, HALF_TIME, MATCH_LENGTH, currentAbility, isAvailable, SEVERITY_LABEL,
  CUP_FINAL_ROUND_NAME, decideAiHalftimeTactic,
  type Club, type Tactic, type MatchEvent, type MatchResult, type LiveStats, type InjuryEvent,
} from '@soccer-tycoon/engine';
import type { WatchSetup, MatchPreview as MatchPreviewData } from '../game.js';
import { swapPlayer } from '../tactics.js';
import { Tactics } from './Tactics.js';
import { MatchPitch, type PitchState } from './MatchPitch.js';
import { MatchStats } from './MatchStats.js';
import { MatchPreview } from './MatchPreview.js';
import { useModalA11y } from './useModalA11y.js';

interface Props {
  watch: WatchSetup;
  myClub: Club;
  initialTactic: Tactic;
  preview: MatchPreviewData | null;
  rivalClubId: string;
  onDone: (result: MatchResult) => void;
  onCancel: () => void;
}

type Phase = 'ready' | 'playing' | 'halftime' | 'playing2' | 'fulltime';
const TICK_MS = 130;
/** 경기당 자유 교체 허용 횟수(부상 교체도 이 카운트를 함께 소모한다). */
const SUB_LIMIT = 3;

const OUTCOME: Record<string, string> = {
  GOAL: '⚽ 골!', SAVE: '🧤 선방', OFF_TARGET: '➡️ 빗나감', BLOCKED: '🛡️ 블록', OWN_GOAL: '🥅 자책골',
};

type QuickTacticValues = Pick<Tactic, 'mentality' | 'tempo' | 'pressing' | 'width' | 'defensiveLine'>;
/** 뒤지고 있을 때 한 번에 적용하는 공격적 지시. */
const CHASE_TACTIC: QuickTacticValues = { mentality: 0.75, tempo: 0.8, pressing: 0.75, width: 0.6, defensiveLine: 0.65 };
/** 앞서고 있을 때 한 번에 적용하는 안정적 지시. */
const PROTECT_TACTIC: QuickTacticValues = { mentality: 0.3, tempo: 0.35, pressing: 0.35, width: 0.4, defensiveLine: 0.35 };

interface View {
  minute: number;
  score: [number, number];
  ball: { x: number; y: number };
}

/** "GOAL!" 배너 표시 지속시간(ms) — 틱 주기(TICK_MS)와 무관하게 고정. */
const GOAL_FLASH_MS = 1500;

export function WatchMatch({ watch, myClub, initialTactic, preview, rivalClubId, onDone, onCancel }: Props) {
  const liveRef = useRef<LiveMatch | null>(null);
  if (liveRef.current === null) liveRef.current = new LiveMatch(watch.setup);
  const live = liveRef.current;
  const minuteRef = useRef(0);

  const homeName = watch.setup.home.club.name;
  const awayName = watch.setup.away.club.name;
  const userSide: 'home' | 'away' = watch.userIsHome ? 'home' : 'away';
  const isDerby = watch.opponent.id === rivalClubId;
  const isFinal = watch.cupRoundName === CUP_FINAL_ROUND_NAME;

  const [phase, setPhase] = useState<Phase>('ready');
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const [view, setView] = useState<View>({ minute: 0, score: [0, 0], ball: { x: 0.5, y: 0.5 } });
  const [goalFlash, setGoalFlash] = useState<'home' | 'away' | null>(null);
  const goalFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (goalFlashTimerRef.current) clearTimeout(goalFlashTimerRef.current);
  }, []);
  const [feed, setFeed] = useState<MatchEvent[]>([]);
  const [tactic, setTactic] = useState<Tactic>(initialTactic);
  const [stats, setStats] = useState<LiveStats>({ possession: [50, 50], shots: [0, 0], shotsOnTarget: [0, 0] });
  const [injuryFeed, setInjuryFeed] = useState<InjuryEvent[]>([]);
  const [activeInjury, setActiveInjury] = useState<InjuryEvent | null>(null);
  const [subsUsed, setSubsUsed] = useState(0);
  const [subModalOpen, setSubModalOpen] = useState(false);
  /** 하프타임에 AI(상대) 측이 조정한 전술 — 없으면 킥오프 셋업 그대로. */
  const [aiTacticOverride, setAiTacticOverride] = useState<Tactic | null>(null);
  const [aiHalftimeNote, setAiHalftimeNote] = useState<string | null>(null);

  // 부상 스케줄은 킥오프 시점에 확정(재현성) — 관전 중 분이 지날 때마다 하나씩 노출.
  const injuryScheduleRef = useRef<InjuryEvent[] | null>(null);
  if (injuryScheduleRef.current === null) injuryScheduleRef.current = live.injuries();
  const revealedIdxRef = useRef(0);
  const pendingMineRef = useRef<InjuryEvent[]>([]);

  /**
   * target분까지 지난 부상 이벤트를 피드에 공개.
   * interactive=true(기본)면 내 선수(현재 라인업 소속) 부상은 교체 대기열에 추가해
   * 경기를 잠시 멈추고 묻는다 — "빠르게" 스킵 중에는 방해하지 않도록 false로 끈다.
   */
  function revealInjuriesUpTo(target: number, currentTactic: Tactic, interactive = true) {
    const schedule = injuryScheduleRef.current!;
    const newlyMine: InjuryEvent[] = [];
    const newlyShown: InjuryEvent[] = [];
    while (revealedIdxRef.current < schedule.length && schedule[revealedIdxRef.current]!.minute <= target) {
      const e = schedule[revealedIdxRef.current]!;
      revealedIdxRef.current++;
      newlyShown.push(e);
      const stillOnPitch = currentTactic.lineup.some((s) => s.playerId === e.playerId);
      if (interactive && e.side === userSide && stillOnPitch) newlyMine.push(e);
    }
    if (newlyShown.length) setInjuryFeed((f) => [...newlyShown.reverse(), ...f]);
    if (newlyMine.length) pendingMineRef.current.push(...newlyMine);
  }

  // 대기 중인 내 부상 이벤트가 있고, 아직 프롬프트가 없으면 하나 꺼내 표시(경기 일시 정지).
  useEffect(() => {
    if (!activeInjury && pendingMineRef.current.length > 0) {
      setActiveInjury(pendingMineRef.current.shift()!);
    }
  });

  function applyMinute(target: number, evs: MatchEvent[]) {
    const last = evs[evs.length - 1];
    const goal = evs.find((e) => e.outcome === 'GOAL' || e.outcome === 'OWN_GOAL');
    const ball = last
      ? { x: last.side === 'home' ? 0.84 : 0.16, y: 0.28 + Math.random() * 0.44 }
      : { x: 0.4 + Math.random() * 0.2, y: 0.34 + Math.random() * 0.32 };
    setView({ minute: target, score: live.score(), ball });
    if (goal) {
      // 틱 주기(130ms)에 얹으면 다음 틱이 없을 때(하프타임 경계 등) 배너가 얼어붙어
      // 남아있거나, 반대로 다음 틱이 바로 이어지면 한 프레임만 스쳐 지나간다 —
      // 틱과 무관한 고정 지속시간을 직접 타이머로 관리한다.
      if (goalFlashTimerRef.current) clearTimeout(goalFlashTimerRef.current);
      setGoalFlash(goal.side);
      goalFlashTimerRef.current = setTimeout(() => setGoalFlash(null), GOAL_FLASH_MS);
    }
    setStats(live.stats());
    const notable = evs.filter((e) => e.outcome === 'GOAL' || e.outcome === 'OWN_GOAL' || e.outcome === 'SAVE');
    if (notable.length) setFeed((f) => [...notable.reverse(), ...f]);
  }

  // 분 단위 진행 타이머 (phase가 진행 중이고, 교체 결정 대기 중이 아니고, 일시정지 상태가 아닐 때만)
  useEffect(() => {
    if (phase !== 'playing' && phase !== 'playing2') return;
    if (activeInjury) return; // 부상 교체 프롬프트 응답 전에는 진행 정지
    if (subModalOpen) return; // 자유 교체 창이 열려 있는 동안도 진행 정지
    if (paused) return;
    const id = setInterval(() => {
      const target = Math.min(minuteRef.current + 1, MATCH_LENGTH);
      if (target === minuteRef.current) return;
      const evs = live.runUntil(target);
      minuteRef.current = target;
      applyMinute(target, evs);
      revealInjuriesUpTo(target, tactic);
    }, TICK_MS / speed);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, activeInjury, subModalOpen, tactic, paused, speed]);

  // 경계(하프타임·풀타임) 전환
  useEffect(() => {
    if (phase === 'playing' && view.minute >= HALF_TIME) setPhase('halftime');
    if (phase === 'playing2' && view.minute >= MATCH_LENGTH) setPhase('fulltime');
  }, [view.minute, phase]);

  function skip() {
    const boundary = phase === 'playing' ? HALF_TIME : MATCH_LENGTH;
    const evs = live.runUntil(boundary);
    minuteRef.current = boundary;
    applyMinute(boundary, evs);
    revealInjuriesUpTo(boundary, tactic, false);
  }

  /** 라인업 슬롯 교체를 즉시 엔진에 반영(부상 교체·자유 교체 공통 경로). 교체 카드 1장 소모. */
  function performSubstitution(outPlayerId: string, inPlayerId: string) {
    const slotIndex = tactic.lineup.findIndex((s) => s.playerId === outPlayerId);
    if (slotIndex < 0) return;
    const next = swapPlayer(tactic, slotIndex, inPlayerId);
    setTactic(next);
    live.setTactic(userSide, next);
    setSubsUsed((n) => n + 1);
  }

  /** 부상 교체 확정: 라인업을 즉시 교체하고(경기 재개), 하프타임 UI에도 반영. */
  function confirmSubstitution(outPlayerId: string, inPlayerId: string) {
    performSubstitution(outPlayerId, inPlayerId);
    setActiveInjury(null);
  }

  /** 관전 중 자유 교체 확정(부상과 무관하게 언제든). */
  function confirmFreeSubstitution(outPlayerId: string, inPlayerId: string) {
    performSubstitution(outPlayerId, inPlayerId);
    setSubModalOpen(false);
  }

  /** 스코어라인 기반 빠른 지시: 슬라이더 5개를 한 번에 갈아 끼운다. */
  function applyQuickTactic(values: QuickTacticValues) {
    const next = { ...tactic, ...values };
    setTactic(next);
    live.setTactic(userSide, next);
  }

  /** 후반 시작 시 사용자 전술을 확정하고, 상대(AI) 측도 부상 교체(F01)·반응형 전술(F09)을
   *  동일한 하프타임 개입 지점에서 자동 적용한다 — 사람만 개입할 수 있던 비대칭을 없앤다. */
  function startSecondHalf() {
    live.setTactic(userSide, tactic);

    const aiSide = userSide === 'home' ? 'away' : 'home';
    const aiClub = aiSide === 'home' ? watch.setup.home.club : watch.setup.away.club;
    const aiTactic = aiSide === 'home' ? watch.setup.home.tactic : watch.setup.away.tactic;
    const [homeGoals, awayGoals] = live.score();
    const aiGoals = aiSide === 'home' ? homeGoals : awayGoals;
    const humanGoals = aiSide === 'home' ? awayGoals : homeGoals;
    const aiHalfInjuries = injuryScheduleRef.current!.filter((e) => e.side === aiSide && e.minute <= HALF_TIME);
    const nextAiTactic = decideAiHalftimeTactic(aiClub, aiTactic, aiGoals, humanGoals, aiHalfInjuries);
    if (nextAiTactic) {
      live.setTactic(aiSide, nextAiTactic);
      setAiTacticOverride(nextAiTactic);
      setAiHalftimeNote(`${watch.opponent.name}이(가) 하프타임에 전술을 조정했습니다.`);
    }

    setPaused(false);
    setPhase('playing2');
  }

  // 현재 포메이션(하프타임 전술 변경 반영): 사용자 측은 라이브 tactic, 상대는 셋업 고정이되
  // AI가 하프타임에 개입했으면(F01/F09) 그 결과를 반영한다.
  const homeTactic = watch.userIsHome ? tactic : (aiTacticOverride ?? watch.setup.home.tactic);
  const awayTactic = watch.userIsHome ? (aiTacticOverride ?? watch.setup.away.tactic) : tactic;
  const homeClub = watch.setup.home.club;
  const awayClub = watch.setup.away.club;
  const myGoals = watch.userIsHome ? view.score[0] : view.score[1];
  const oppGoals = watch.userIsHome ? view.score[1] : view.score[0];
  const userBehind = myGoals < oppGoals;
  const userAhead = myGoals > oppGoals;
  const pitch: PitchState = {
    homeName, awayName, score: view.score, minute: view.minute,
    ball: view.ball, goalFlash, userIsHome: watch.userIsHome,
    homeFormation: homeTactic.lineup.map((s) => s.position),
    awayFormation: awayTactic.lineup.map((s) => s.position),
    homeLabels: homeTactic.lineup.map((slot) => playerInitials(homeClub, slot.playerId)),
    awayLabels: awayTactic.lineup.map((slot) => playerInitials(awayClub, slot.playerId)),
    isDerby,
    isFinal,
  };

  return (
    <div className="watch">
      <div className="watch-topbar">
        <button className="btn-ghost" onClick={onCancel}>← 취소</button>
        <span className="muted">상대: <b>{watch.opponent.name}</b> (평균 CA {avgCA(watch.opponent)})</span>
        {isFinal && <span className="final-badge">🏆 컵 결승</span>}
        {isDerby && <span className="derby-badge">🔥 라이벌전</span>}
      </div>

      <div className="watch-2col">
        <div>
          <MatchPitch {...pitch} />
          <div className="watch-controls">
            {phase === 'ready' && (
              <button className="btn-advance big" onClick={() => setPhase('playing')}>킥오프 ▶</button>
            )}
            {(phase === 'playing' || phase === 'playing2') && (
              <>
                <button className="btn-ghost" onClick={() => setPaused((p) => !p)}>
                  {paused ? '▶ 재개' : '⏸ 일시정지'}
                </button>
                <div className="speed-toggle">
                  {([1, 2, 4] as const).map((s) => (
                    <button
                      key={s}
                      className={speed === s ? 'speed-btn active' : 'speed-btn'}
                      onClick={() => setSpeed(s)}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
                <button className="btn-ghost" onClick={skip}>
                  빠르게 ▶▶ ({phase === 'playing' ? '하프타임' : '경기 종료'}까지)
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => setSubModalOpen(true)}
                  disabled={subsUsed >= SUB_LIMIT}
                  title={subsUsed >= SUB_LIMIT ? '교체 카드를 모두 사용했습니다' : '선수 교체'}
                >
                  🔄 교체 ({subsUsed}/{SUB_LIMIT})
                </button>
                {userBehind && (
                  <button className="btn-ghost quick-tactic chase" onClick={() => applyQuickTactic(CHASE_TACTIC)}>
                    🔥 추격 모드
                  </button>
                )}
                {userAhead && (
                  <button className="btn-ghost quick-tactic protect" onClick={() => applyQuickTactic(PROTECT_TACTIC)}>
                    🛡 리드 지키기
                  </button>
                )}
              </>
            )}
            {phase === 'halftime' && (
              <button className="btn-advance" onClick={startSecondHalf}>후반 시작 ▶</button>
            )}
            {phase === 'fulltime' && (
              <button className="btn-advance" onClick={() => onDone(live.result())}>
                결과 확정 및 라운드 진행 →
              </button>
            )}
          </div>
        </div>

        <div className="watch-side">
          {phase === 'ready' && preview ? (
            <MatchPreview preview={preview} rivalClubId={rivalClubId} />
          ) : phase === 'halftime' ? (
            <>
              <div className="ht-banner">
                {isFinal
                  ? '🏆 컵 결승 하프타임 — 전술을 조정할 수 있습니다'
                  : isDerby
                    ? '🔥 라이벌전 하프타임 — 전술을 조정할 수 있습니다'
                    : '하프타임 — 전술을 조정할 수 있습니다'}
              </div>
              <LiveStatsPanel stats={stats} homeName={homeName} awayName={awayName} userSide={userSide} />
              <Tactics club={myClub} tactic={tactic} onChange={setTactic} />
            </>
          ) : phase === 'fulltime' ? (
            <FullTime
              result={live.result()} homeName={homeName} awayName={awayName} score={view.score}
              myClubId={myClub.id} isDerby={isDerby} isFinal={isFinal} userIsHome={watch.userIsHome}
              aiHalftimeNote={aiHalftimeNote}
            />

          ) : (
            <div className="commentary">
              <LiveStatsPanel stats={stats} homeName={homeName} awayName={awayName} userSide={userSide} />
              {aiHalftimeNote && <p className="muted small ai-halftime-note">🔄 {aiHalftimeNote}</p>}
              <h3>중계</h3>
              <Feed events={feed} injuries={injuryFeed} userSide={userSide} />
            </div>
          )}
        </div>
      </div>

      {activeInjury && (
        <InjurySubModal
          injury={activeInjury}
          club={myClub}
          tactic={tactic}
          subsUsed={subsUsed}
          subLimit={SUB_LIMIT}
          onConfirm={confirmSubstitution}
          onDismiss={() => setActiveInjury(null)}
        />
      )}
      {subModalOpen && (
        <FreeSubModal
          club={myClub}
          tactic={tactic}
          subsUsed={subsUsed}
          subLimit={SUB_LIMIT}
          onConfirm={confirmFreeSubstitution}
          onDismiss={() => setSubModalOpen(false)}
        />
      )}
    </div>
  );
}

function LiveStatsPanel({
  stats, homeName, awayName, userSide,
}: { stats: LiveStats; homeName: string; awayName: string; userSide: 'home' | 'away' }) {
  const [hp, ap] = stats.possession;
  const rows: { label: string; h: number; a: number }[] = [
    { label: '슈팅', h: stats.shots[0], a: stats.shots[1] },
    { label: '유효슈팅', h: stats.shotsOnTarget[0], a: stats.shotsOnTarget[1] },
  ];
  return (
    <div className="live-stats">
      <div className="ls-head">
        <span className={userSide === 'home' ? 'mine' : ''}>{homeName}</span>
        <span className="muted small">실시간</span>
        <span className={userSide === 'away' ? 'mine' : ''}>{awayName}</span>
      </div>
      <div className="ls-poss-nums">
        <b>{hp}%</b><span className="muted small">점유율</span><b>{ap}%</b>
      </div>
      <div className="ls-poss-bar">
        <div className={`ls-seg ${userSide === 'home' ? 'mine' : 'opp'}`} style={{ width: `${hp}%` }} />
        <div className={`ls-seg ${userSide === 'away' ? 'mine' : 'opp'}`} style={{ width: `${ap}%` }} />
      </div>
      {rows.map((r) => (
        <div className="ls-row" key={r.label}>
          <span className={`ls-num ${r.h >= r.a ? 'lead' : ''}`}>{r.h}</span>
          <span className="ls-label muted small">{r.label}</span>
          <span className={`ls-num ${r.a >= r.h ? 'lead' : ''}`}>{r.a}</span>
        </div>
      ))}
    </div>
  );
}

type FeedItem =
  | { kind: 'match'; minute: number; ev: MatchEvent }
  | { kind: 'injury'; minute: number; ev: InjuryEvent };

function Feed({
  events, injuries, userSide,
}: { events: MatchEvent[]; injuries: InjuryEvent[]; userSide: 'home' | 'away' }) {
  const items: FeedItem[] = [
    ...events.map((ev): FeedItem => ({ kind: 'match', minute: ev.minute, ev })),
    ...injuries.map((ev): FeedItem => ({ kind: 'injury', minute: ev.minute, ev })),
  ];
  // 각 목록은 이미 최신순으로 쌓이므로, 삽입 순서를 보존하며 안정적으로 합친다.
  items.sort((a, b) => b.minute - a.minute);
  if (items.length === 0) return <p className="muted small">아직 주요 장면이 없습니다.</p>;
  return (
    <ul className="feed">
      {items.map((it) => it.kind === 'match' ? (
        <li
          key={`match-${it.ev.minute}-${it.ev.playerId}`}
          className={(it.ev.outcome === 'GOAL' || it.ev.outcome === 'OWN_GOAL')
            ? (it.ev.side === userSide ? 'goal mine' : 'goal') : ''}
        >
          <span className="feed-min">{it.ev.minute}'</span>
          <span className="feed-text">{it.ev.playerName} — {OUTCOME[it.ev.outcome]}</span>
        </li>
      ) : (
        <li key={`injury-${it.ev.minute}-${it.ev.playerId}`} className="injury-feed">
          <span className="feed-min">{it.ev.minute}'</span>
          <span className="feed-text">
            🚑 {it.ev.playerName} {SEVERITY_LABEL[it.ev.severity]} 부상 ({it.ev.name})
            {it.ev.side === userSide && <span className="muted small"> — 예상 결장 {it.ev.matches}경기</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function InjurySubModal({
  injury, club, tactic, subsUsed, subLimit, onConfirm, onDismiss,
}: {
  injury: InjuryEvent; club: Club; tactic: Tactic; subsUsed: number; subLimit: number;
  onConfirm: (outPlayerId: string, inPlayerId: string) => void;
  onDismiss: () => void;
}) {
  const slot = tactic.lineup.find((s) => s.playerId === injury.playerId);
  const subsExhausted = subsUsed >= subLimit;
  const bench = club.players
    .filter((p) => p.id !== injury.playerId && isAvailable(p) && !tactic.lineup.some((s) => s.playerId === p.id))
    .sort((a, b) => currentAbility(b) - currentAbility(a));

  const ref = useModalA11y<HTMLDivElement>(onDismiss);
  return (
    <div className="modal-backdrop" onClick={onDismiss}>
      <div
        className="modal injury-modal"
        role="dialog"
        aria-modal="true"
        aria-label="부상 발생"
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>🚑 부상 발생</h2>
        </div>
        <p>
          {injury.minute}' <b>{injury.playerName}</b>
          {slot && <span className="muted"> ({slot.position})</span>}
          이(가) <b>{SEVERITY_LABEL[injury.severity]}</b> 부상({injury.name})을 당했습니다.
          예상 결장 <b>{injury.matches}경기</b>.
        </p>
        {subsExhausted ? (
          <p className="muted small">
            교체 카드를 모두 사용했습니다({subsUsed}/{subLimit}) — 교체 없이 이 자리는 빈 슬롯으로 남습니다.
          </p>
        ) : bench.length === 0 ? (
          <p className="muted small">교체 가능한 벤치 선수가 없습니다.</p>
        ) : (
          <>
            <p className="muted small">지금 교체하거나, 계속 뛰게 둘 수 있습니다.</p>
            <ul className="sub-list">
              {bench.slice(0, 8).map((p) => (
                <li key={p.id}>
                  <span>{p.name} ({p.position} · {currentAbility(p).toFixed(0)})</span>
                  <button className="btn-small" onClick={() => onConfirm(injury.playerId, p.id)}>교체</button>
                </li>
              ))}
            </ul>
          </>
        )}
        <button className="btn-ghost" onClick={onDismiss}>계속 진행 (교체 안 함)</button>
      </div>
    </div>
  );
}

/** 부상과 무관하게 관전 중 언제든 선수를 교체하는 모달 — 나갈 선수 → 들어올 선수 2단계 선택. */
function FreeSubModal({
  club, tactic, subsUsed, subLimit, onConfirm, onDismiss,
}: {
  club: Club; tactic: Tactic; subsUsed: number; subLimit: number;
  onConfirm: (outPlayerId: string, inPlayerId: string) => void;
  onDismiss: () => void;
}) {
  const [outId, setOutId] = useState<string | null>(null);
  const outPlayer = outId ? club.players.find((p) => p.id === outId) : null;
  const bench = club.players
    .filter((p) => isAvailable(p) && !tactic.lineup.some((s) => s.playerId === p.id))
    .sort((a, b) => currentAbility(b) - currentAbility(a));

  const ref = useModalA11y<HTMLDivElement>(onDismiss);
  return (
    <div className="modal-backdrop" onClick={onDismiss}>
      <div
        className="modal injury-modal"
        role="dialog"
        aria-modal="true"
        aria-label="선수 교체"
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>🔄 선수 교체 ({subsUsed}/{subLimit})</h2>
          <button className="btn-ghost" onClick={onDismiss}>닫기 ✕</button>
        </div>
        {!outPlayer ? (
          <>
            <p className="muted small">나갈 선수를 선택하세요.</p>
            <ul className="sub-list">
              {tactic.lineup.map((slot) => {
                const p = club.players.find((pl) => pl.id === slot.playerId);
                if (!p) return null;
                return (
                  <li key={slot.playerId}>
                    <span>{p.name} ({slot.position} · {currentAbility(p).toFixed(0)})</span>
                    <button className="btn-small" onClick={() => setOutId(p.id)}>선택</button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <>
            <p className="muted small"><b>{outPlayer.name}</b> 대신 들어올 선수를 선택하세요.</p>
            {bench.length === 0 ? (
              <p className="muted small">교체 가능한 벤치 선수가 없습니다.</p>
            ) : (
              <ul className="sub-list">
                {bench.slice(0, 10).map((p) => (
                  <li key={p.id}>
                    <span>{p.name} ({p.position} · {currentAbility(p).toFixed(0)})</span>
                    <button className="btn-small" onClick={() => onConfirm(outPlayer.id, p.id)}>교체</button>
                  </li>
                ))}
              </ul>
            )}
            <button className="btn-ghost" onClick={() => setOutId(null)}>← 다시 선택</button>
          </>
        )}
      </div>
    </div>
  );
}

function FullTime({
  result, homeName, awayName, score, myClubId, isDerby, isFinal, userIsHome, aiHalftimeNote,
}: {
  result: MatchResult; homeName: string; awayName: string; score: [number, number]; myClubId: string;
  isDerby: boolean; isFinal: boolean; userIsHome: boolean; aiHalftimeNote: string | null;
}) {
  const myGoals = userIsHome ? score[0] : score[1];
  const oppGoals = userIsHome ? score[1] : score[0];
  const outcome = myGoals > oppGoals ? 'win' : myGoals < oppGoals ? 'loss' : 'draw';
  return (
    <div className="ft-panel">
      <h3>경기 종료</h3>
      {aiHalftimeNote && <p className="muted small ai-halftime-note">🔄 {aiHalftimeNote}</p>}
      {isFinal && (
        <p className={`final-result ${outcome}`}>
          {outcome === 'win' && '🏆 컵 우승 확정! 결승에서 승리했습니다.'}
          {outcome === 'draw' && '🏆 결승 무승부 — 승부차기로 우승팀이 가려집니다.'}
          {outcome === 'loss' && '🏆 결승 패배… 준우승에 머물렀습니다.'}
        </p>
      )}
      {isDerby && (
        <p className={`derby-result ${outcome}`}>
          {outcome === 'win' && '🔥 라이벌전 승리!'}
          {outcome === 'draw' && '🔥 라이벌전 무승부'}
          {outcome === 'loss' && '🔥 라이벌전 패배…'}
        </p>
      )}
      <p className="ft-score">{homeName} {score[0]} : {score[1]} {awayName}</p>
      {(() => {
        const motm = [...result.playerStats.home, ...result.playerStats.away]
          .find((s) => s.playerId === result.motmPlayerId);
        return motm ? (
          <p className="ft-motm">🏅 맨오브더매치 — <b>{motm.name}</b> ({motm.rating.toFixed(1)})</p>
        ) : null;
      })()}
      {result.cards.length > 0 && (
        <ul className="card-list">
          {result.cards.map((c) => (
            <li key={`${c.minute}-${c.playerId}-${c.type}`}>
              <span className="feed-min">{c.minute}'</span>
              <span>{c.type === 'red' ? '🟥' : '🟨'} {c.playerName}</span>
            </li>
          ))}
        </ul>
      )}
      <MatchStats result={result} myClubId={myClubId} />
    </div>
  );
}

function avgCA(club: Club): number {
  return Math.round(club.players.reduce((s, p) => s + currentAbility(p), 0) / club.players.length);
}

/** 등번호가 없으므로 이름 이니셜 2자로 피치 위 선수를 구분한다. */
function playerInitials(club: Club, playerId: string): string {
  const player = club.players.find((p) => p.id === playerId);
  if (!player) return '';
  const parts = player.name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return player.name.slice(0, 2).toUpperCase();
}
