import { useEffect, useRef, useState } from 'react';
import type { DragEndEvent } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  LiveMatch, HALF_TIME, MATCH_LENGTH, currentAbility, isAvailable, SEVERITY_LABEL,
  CUP_FINAL_ROUND_NAME, decideAiHalftimeTactic,
  type Club, type Player, type Tactic, type MatchEvent, type MatchResult, type LiveStats,
  type InjuryEvent, type CardEvent,
} from '@soccer-tycoon/engine';
import type { WatchSetup, MatchPreview as MatchPreviewData } from '../game.js';
import { swapPlayer } from '../tactics.js';
import { resolveKitColors } from '../clubColors.js';
import { loadSubPriority, saveSubPriority, sortByPriority } from '../subPriority.js';
import { WATCH_SPEEDS, loadWatchPrefs, saveWatchPrefs, type WatchPrefs } from '../watchPrefs.js';
import { useToast } from '../toast.js';
import { Tactics } from './Tactics.js';
import { MatchPitch, type PitchState } from './MatchPitch.js';
import { MatchStats } from './MatchStats.js';
import { MatchPreview } from './MatchPreview.js';
import { useModalA11y } from './useModalA11y.js';
import {
  DndScope, useDroppableZone,
  SortableContext, useSortable, arrayMove, verticalListSortingStrategy,
} from './dnd/DndPrimitives.js';

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
/** 스코어보드 히어로에 표시하는 경기 국면 라벨. */
const PHASE_LABEL: Record<Phase, string> = {
  ready: '킥오프 전', playing: '전반', halftime: '하프타임', playing2: '후반', fulltime: '경기 종료',
};
/** 1x 배속에서 경기 1분이 흐르는 실제 시간(ms) — 경기 개입 개선 M1(A1).
 *  이전 130ms/분(90분 ≈ 12초)에서 대폭 감속해, 1x가 "경기를 읽고 개입하는"
 *  기본 관전 경험이 되도록 재정의한다. 예전 속도감은 8x 배속이 대신한다. */
const MINUTE_MS = 1000;
/** 분 내부 시각적 서브틱 수(A3) — 엔진은 분 단위 결정성을 그대로 유지하고,
 *  화면(공 드리프트·선수 흔들림)만 서브틱으로 잘게 쪼개 연속적으로 움직인다. */
const SUBTICKS = 4;
/** 경기당 자유 교체 허용 횟수(부상 교체도 이 카운트를 함께 소모한다). */
const SUB_LIMIT = 3;

const OUTCOME: Record<string, string> = {
  GOAL: '⚽ 골!', SAVE: '🧤 선방', OFF_TARGET: '➡️ 빗나감', BLOCKED: '🛡️ 블록', OWN_GOAL: '🥅 자책골',
};

type QuickTacticValues = Partial<Pick<Tactic, 'mentality' | 'tempo' | 'pressing' | 'width' | 'defensiveLine'>>;
type SliderKey = 'mentality' | 'tempo' | 'pressing' | 'width' | 'defensiveLine';
const SLIDER_LABEL: Record<SliderKey, string> = {
  mentality: '멘탈리티', tempo: '템포', pressing: '압박', width: '폭', defensiveLine: '수비라인',
};

/** 퀵 전술 프리셋(M2 B4/B5) — 스코어 조건과 무관하게 상시 노출된다. 값을 지정한
 *  슬라이더만 갈아 끼우는 부분 패치라, 나머지 지시는 현재 설정을 그대로 유지한다. */
const QUICK_PRESETS: { key: string; label: string; title: string; values: QuickTacticValues; tone?: 'chase' | 'protect' }[] = [
  {
    key: 'chase', label: '🔥 추격', tone: 'chase',
    title: '공격 전면 전환 — 멘탈리티·템포·압박·수비라인 상향',
    values: { mentality: 0.75, tempo: 0.8, pressing: 0.75, width: 0.6, defensiveLine: 0.65 },
  },
  {
    key: 'protect', label: '🛡 리드 지키기', tone: 'protect',
    title: '안정 운영 — 낮은 템포·압박·수비라인으로 전환',
    values: { mentality: 0.3, tempo: 0.35, pressing: 0.35, width: 0.4, defensiveLine: 0.35 },
  },
  { key: 'highpress', label: '⚡ 하이 프레스', title: '강한 전방 압박 + 높은 수비라인(뒷공간 위험 감수)', values: { pressing: 0.8, defensiveLine: 0.7 } },
  { key: 'lowblock', label: '🧱 로우 블록', title: '낮은 압박 + 낮은 수비라인으로 골문 앞을 걸어 잠금', values: { pressing: 0.3, defensiveLine: 0.25 } },
  { key: 'tempoup', label: '🚀 템포 업', title: '공격 전개 속도만 끌어올림(체력 소모 증가)', values: { tempo: 0.8 } },
  { key: 'slowdown', label: '⏳ 시간 끌기', title: '템포를 죽이고 신중하게 — 리드 막판 운영용', values: { tempo: 0.2, mentality: 0.35 } },
];

/** 멘탈리티 5단 스테퍼(M2 B3) — 슬라이더를 열지 않고도 한 번에 성향을 바꾼다. */
const MENTALITY_STEPS: { label: string; value: number }[] = [
  { label: '초수비', value: 0.1 },
  { label: '수비', value: 0.3 },
  { label: '균형', value: 0.5 },
  { label: '공격', value: 0.7 },
  { label: '초공격', value: 0.9 },
];

interface View {
  minute: number;
  /** 분 내부 서브틱 진행률(0~1 미만) — 캔버스 애니메이션용. 스코어보드에는 정수 분만 표시. */
  frac: number;
  score: [number, number];
  ball: { x: number; y: number };
}

/** "GOAL!" 배너 표시 지속시간(ms) — 틱 주기(TICK_MS)와 무관하게 고정. */
const GOAL_FLASH_MS = 1500;
/** 피치 위 카드/부상 아이콘 하이라이트 표시 지속시간(ms, 고도화 항목 B1/B2). */
const CARD_FLASH_MS = 2000;
const INJURY_FLASH_MS = 2000;

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
  /** 배속·자동 일시정지 설정(M1 A5/A8) — 변경 즉시 저장돼 다음 경기에도 유지. */
  const [prefs, setPrefs] = useState<WatchPrefs>(() => loadWatchPrefs());
  function updatePrefs(patch: Partial<WatchPrefs>) {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      saveWatchPrefs(next);
      return next;
    });
  }
  const subtickRef = useRef(0);
  const [view, setView] = useState<View>({ minute: 0, frac: 0, score: [0, 0], ball: { x: 0.5, y: 0.5 } });
  const [goalFlash, setGoalFlash] = useState<'home' | 'away' | null>(null);
  const goalFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cardFlash, setCardFlash] = useState<{ side: 'home' | 'away'; slotIndex: number; type: 'yellow' | 'red' } | null>(null);
  const cardFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [injuryFlash, setInjuryFlash] = useState<{ side: 'home' | 'away'; slotIndex: number } | null>(null);
  const injuryFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (goalFlashTimerRef.current) clearTimeout(goalFlashTimerRef.current);
    if (cardFlashTimerRef.current) clearTimeout(cardFlashTimerRef.current);
    if (injuryFlashTimerRef.current) clearTimeout(injuryFlashTimerRef.current);
  }, []);
  const [feed, setFeed] = useState<MatchEvent[]>([]);
  const [tactic, setTactic] = useState<Tactic>(initialTactic);
  const [stats, setStats] = useState<LiveStats>({ possession: [50, 50], shots: [0, 0], shotsOnTarget: [0, 0] });
  const [injuryFeed, setInjuryFeed] = useState<InjuryEvent[]>([]);
  const [cardFeed, setCardFeed] = useState<CardEvent[]>([]);
  const [activeInjury, setActiveInjury] = useState<InjuryEvent | null>(null);
  const [subsUsed, setSubsUsed] = useState(0);
  const [subModalOpen, setSubModalOpen] = useState(false);
  /** 벤치 드래그 교체 우선순위(D28) — 관전 화면에서 벤치 칩을 재정렬하면 저장된다. */
  const [subPriority, setSubPriority] = useState<string[]>(() => loadSubPriority());
  function handleReorderSubPriority(order: string[]) {
    setSubPriority(order);
    saveSubPriority(order);
  }
  /** 하프타임에 AI(상대) 측이 조정한 전술 — 없으면 킥오프 셋업 그대로. */
  const [aiTacticOverride, setAiTacticOverride] = useState<Tactic | null>(null);
  const [aiHalftimeNote, setAiHalftimeNote] = useState<string | null>(null);
  /** 인게임 전술 패널(M2 B1/B2) — 열면 자동 일시정지, 닫으면 재개. */
  const [tacticPanelOpen, setTacticPanelOpen] = useState(false);
  /** 패널을 연 시점의 전술 스냅샷 — 닫을 때 diff를 요약해 변경 이력(E1)에 남긴다. */
  const tacticSnapshotRef = useRef<Tactic | null>(null);
  /** 전술 변경 이력(M2 E1) — 중계 피드에 함께 흐른다. */
  const [tacticLog, setTacticLog] = useState<{ minute: number; text: string }[]>([]);
  const toast = useToast();

  // 부상 스케줄은 킥오프 시점에 확정(재현성) — 관전 중 분이 지날 때마다 하나씩 노출.
  const injuryScheduleRef = useRef<InjuryEvent[] | null>(null);
  if (injuryScheduleRef.current === null) injuryScheduleRef.current = live.injuries();
  const revealedIdxRef = useRef(0);
  const pendingMineRef = useRef<InjuryEvent[]>([]);

  // 카드 스케줄도 부상과 동일하게 킥오프 시점에 확정 — 관전 중 분이 지날 때마다 노출(고도화 항목 B1).
  const cardScheduleRef = useRef<CardEvent[] | null>(null);
  if (cardScheduleRef.current === null) cardScheduleRef.current = live.cards();
  const revealedCardIdxRef = useRef(0);

  /**
   * target분까지 지난 부상 이벤트를 피드에 공개.
   * interactive=true(기본)면 내 선수(현재 라인업 소속) 부상은 교체 대기열에 추가해
   * 경기를 잠시 멈추고 묻는다 — "빠르게" 스킵 중에는 방해하지 않도록 false로 끈다.
   * 공개된 마지막 이벤트는 소속 팀 슬롯 위치를 찾아 피치 위 🚑 하이라이트도 함께 띄운다(항목 B2).
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
    if (newlyShown.length) {
      const last = newlyShown[newlyShown.length - 1]!;
      setInjuryFeed((f) => [...newlyShown.slice().reverse(), ...f]);
      const sideTactic = last.side === 'home' ? homeTactic : awayTactic;
      const slotIndex = sideTactic.lineup.findIndex((s) => s.playerId === last.playerId);
      if (slotIndex >= 0) {
        if (injuryFlashTimerRef.current) clearTimeout(injuryFlashTimerRef.current);
        setInjuryFlash({ side: last.side, slotIndex });
        injuryFlashTimerRef.current = setTimeout(() => setInjuryFlash(null), INJURY_FLASH_MS);
      }
    }
    if (newlyMine.length) pendingMineRef.current.push(...newlyMine);
  }

  /**
   * target분까지 지난 카드 이벤트를 중계 피드에 공개하고, 피치 위 해당 슬롯 선수 위에
   * 🟨/🟥 하이라이트를 띄운다(고도화 항목 B1) — 이전에는 카드가 경기 종료 후 결과 패널에만
   * 노출돼 관전 중에는 전혀 알 수 없었다.
   */
  function revealCardsUpTo(target: number, allowAutoPause = true) {
    const schedule = cardScheduleRef.current!;
    const newlyShown: CardEvent[] = [];
    while (revealedCardIdxRef.current < schedule.length && schedule[revealedCardIdxRef.current]!.minute <= target) {
      const e = schedule[revealedCardIdxRef.current]!;
      revealedCardIdxRef.current++;
      newlyShown.push(e);
    }
    if (newlyShown.length) {
      const last = newlyShown[newlyShown.length - 1]!;
      setCardFeed((f) => [...newlyShown.slice().reverse(), ...f]);
      const sideTactic = last.side === 'home' ? homeTactic : awayTactic;
      const slotIndex = sideTactic.lineup.findIndex((s) => s.playerId === last.playerId);
      if (slotIndex >= 0) {
        if (cardFlashTimerRef.current) clearTimeout(cardFlashTimerRef.current);
        setCardFlash({ side: last.side, slotIndex, type: last.type });
        cardFlashTimerRef.current = setTimeout(() => setCardFlash(null), CARD_FLASH_MS);
      }
      if (allowAutoPause && prefs.pauseOnCard) setPaused(true);
    }
  }

  // 대기 중인 내 부상 이벤트가 있고, 아직 프롬프트가 없으면 하나 꺼내 표시(경기 일시 정지).
  useEffect(() => {
    if (!activeInjury && pendingMineRef.current.length > 0) {
      setActiveInjury(pendingMineRef.current.shift()!);
    }
  });

  function applyMinute(target: number, evs: MatchEvent[], allowAutoPause = true) {
    const last = evs[evs.length - 1];
    const goal = evs.find((e) => e.outcome === 'GOAL' || e.outcome === 'OWN_GOAL');
    const ball = last
      ? { x: last.side === 'home' ? 0.84 : 0.16, y: 0.28 + Math.random() * 0.44 }
      : { x: 0.4 + Math.random() * 0.2, y: 0.34 + Math.random() * 0.32 };
    setView({ minute: target, frac: 0, score: live.score(), ball });
    if (goal) {
      // 틱 주기에 얹으면 다음 틱이 없을 때(하프타임 경계 등) 배너가 얼어붙어
      // 남아있거나, 반대로 다음 틱이 바로 이어지면 한 프레임만 스쳐 지나간다 —
      // 틱과 무관한 고정 지속시간을 직접 타이머로 관리한다.
      if (goalFlashTimerRef.current) clearTimeout(goalFlashTimerRef.current);
      setGoalFlash(goal.side);
      goalFlashTimerRef.current = setTimeout(() => setGoalFlash(null), GOAL_FLASH_MS);
      // 골 후 자동 일시정지(M1 A5) — 스코어가 바뀐 순간이 전술을 다시 생각할 시점이다.
      if (allowAutoPause && prefs.pauseOnGoal) setPaused(true);
    }
    setStats(live.stats());
    const notable = evs.filter((e) => e.outcome === 'GOAL' || e.outcome === 'OWN_GOAL' || e.outcome === 'SAVE');
    if (notable.length) setFeed((f) => [...notable.reverse(), ...f]);
  }

  // 진행 타이머 — 1분을 SUBTICKS개의 시각 서브틱으로 쪼갠다(M1 A1/A3). 서브틱에서는
  // 공이 현재 위치 주변을 짧게 드리프트하며 "경기가 흐르는" 감각만 만들고, 마지막
  // 서브틱에서 엔진을 정확히 1분 전진시킨다(엔진 결정성은 분 단위 그대로).
  useEffect(() => {
    if (phase !== 'playing' && phase !== 'playing2') return;
    if (activeInjury) return; // 부상 교체 프롬프트 응답 전에는 진행 정지
    if (subModalOpen) return; // 자유 교체 창이 열려 있는 동안도 진행 정지
    if (paused) return;
    const id = setInterval(() => {
      if (subtickRef.current < SUBTICKS - 1) {
        subtickRef.current++;
        const frac = subtickRef.current / SUBTICKS;
        setView((v) => ({
          ...v,
          frac,
          ball: {
            x: Math.min(0.94, Math.max(0.06, v.ball.x + (Math.random() - 0.5) * 0.07)),
            y: Math.min(0.9, Math.max(0.1, v.ball.y + (Math.random() - 0.5) * 0.07)),
          },
        }));
        return;
      }
      subtickRef.current = 0;
      const target = Math.min(minuteRef.current + 1, MATCH_LENGTH);
      if (target === minuteRef.current) return;
      const evs = live.runUntil(target);
      minuteRef.current = target;
      applyMinute(target, evs);
      revealInjuriesUpTo(target, tactic);
      revealCardsUpTo(target);
    }, MINUTE_MS / SUBTICKS / prefs.speed);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, activeInjury, subModalOpen, tactic, paused, prefs]);

  // 경계(하프타임·풀타임) 전환
  useEffect(() => {
    if (phase === 'playing' && view.minute >= HALF_TIME) setPhase('halftime');
    if (phase === 'playing2' && view.minute >= MATCH_LENGTH) setPhase('fulltime');
  }, [view.minute, phase]);

  function skip() {
    const boundary = phase === 'playing' ? HALF_TIME : MATCH_LENGTH;
    const evs = live.runUntil(boundary);
    minuteRef.current = boundary;
    subtickRef.current = 0;
    applyMinute(boundary, evs, false);
    revealInjuriesUpTo(boundary, tactic, false);
    revealCardsUpTo(boundary, false);
  }

  /** +N분 빠른 진행(M1 A7) — 요청한 만큼만 조용히 건너뛴다(자동 일시정지 없음). */
  function skipMinutes(n: number) {
    const boundary = phase === 'playing' ? HALF_TIME : MATCH_LENGTH;
    const target = Math.min(minuteRef.current + n, boundary);
    if (target === minuteRef.current) return;
    const evs = live.runUntil(target);
    minuteRef.current = target;
    subtickRef.current = 0;
    applyMinute(target, evs, false);
    revealInjuriesUpTo(target, tactic);
    revealCardsUpTo(target, false);
  }

  /** 다음 주요 장면(슈팅 결과·카드·부상)까지 건너뛰고 그 앞에서 일시정지(M1 A7) —
   *  "조용한 구간은 넘기되, 장면마다 개입할 기회는 남긴다"는 관전 리듬을 만든다. */
  function skipToNextEvent() {
    const boundary = phase === 'playing' ? HALF_TIME : MATCH_LENGTH;
    const injurySchedule = injuryScheduleRef.current!;
    const cardSchedule = cardScheduleRef.current!;
    const collected: MatchEvent[] = [];
    let m = minuteRef.current;
    while (m < boundary) {
      m++;
      const evs = live.runUntil(m);
      collected.push(...evs);
      const hit = evs.length > 0
        || injurySchedule.some((e) => e.minute === m)
        || cardSchedule.some((e) => e.minute === m);
      if (hit) break;
    }
    minuteRef.current = m;
    subtickRef.current = 0;
    applyMinute(m, collected, false);
    revealInjuriesUpTo(m, tactic);
    revealCardsUpTo(m, false);
    if (m < boundary) setPaused(true);
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

  /** 전술 변경 이력(E1)에 한 줄 기록. */
  function logTactic(text: string) {
    setTacticLog((l) => [{ minute: minuteRef.current, text }, ...l]);
  }

  /** 퀵 지시(M2 B3/B4/B5): 지정한 슬라이더만 갈아 끼우고, 이력·토스트로 확인시킨다(E3). */
  function applyQuickTactic(values: QuickTacticValues, label: string) {
    const next = { ...tactic, ...values };
    setTactic(next);
    live.setTactic(userSide, next);
    logTactic(label);
    toast(`${label} 적용`, true);
  }

  /** 인게임 전술 패널 열기(B1/B2) — 경기를 멈추고 생각할 시간을 확보한다. */
  function openTacticPanel() {
    tacticSnapshotRef.current = tactic;
    setTacticPanelOpen(true);
    setPaused(true);
  }

  /** 전술 패널 닫기 — 연 시점 대비 바뀐 지시를 요약해 이력에 남기고 경기를 재개한다. */
  function closeTacticPanel() {
    const prev = tacticSnapshotRef.current;
    if (prev) {
      const diff = describeTacticDiff(prev, tactic);
      if (diff) {
        logTactic(diff);
        toast('전술 변경 적용', true);
      }
    }
    tacticSnapshotRef.current = null;
    setTacticPanelOpen(false);
    setPaused(false);
  }

  /** 인게임 전술 편집 반영(B1) — 하프타임과 달리 변경 즉시 엔진에 적용된다. */
  function handleLiveTacticChange(next: Tactic) {
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
    subtickRef.current = 0;
    setPhase('playing2');
  }

  // 현재 포메이션(하프타임 전술 변경 반영): 사용자 측은 라이브 tactic, 상대는 셋업 고정이되
  // AI가 하프타임에 개입했으면(F01/F09) 그 결과를 반영한다.
  const homeTactic = watch.userIsHome ? tactic : (aiTacticOverride ?? watch.setup.home.tactic);
  const awayTactic = watch.userIsHome ? (aiTacticOverride ?? watch.setup.away.tactic) : tactic;
  const homeClub = watch.setup.home.club;
  const awayClub = watch.setup.away.club;
  const kit = resolveKitColors(homeClub.id, awayClub.id);
  const myGoals = watch.userIsHome ? view.score[0] : view.score[1];
  const oppGoals = watch.userIsHome ? view.score[1] : view.score[0];
  const userBehind = myGoals < oppGoals;
  const userAhead = myGoals > oppGoals;
  /** 현재 멘탈리티에 가장 가까운 스테퍼 단계(활성 표시용). */
  const nearestMentality = MENTALITY_STEPS.reduce((a, b) =>
    Math.abs(b.value - tactic.mentality) < Math.abs(a.value - tactic.mentality) ? b : a).value;
  const pitch: PitchState = {
    homeName, awayName, score: view.score, minute: view.minute + view.frac,
    ball: view.ball, goalFlash, cardFlash, injuryFlash, userIsHome: watch.userIsHome,
    homeFormation: homeTactic.lineup.map((s) => s.position),
    awayFormation: awayTactic.lineup.map((s) => s.position),
    homeLabels: homeTactic.lineup.map((slot) => playerInitials(homeClub, slot.playerId)),
    awayLabels: awayTactic.lineup.map((slot) => playerInitials(awayClub, slot.playerId)),
    isDerby,
    isFinal,
    kit,
  };

  return (
    <div className="watch">
      <div className="watch-topbar">
        <button className="btn-ghost" onClick={onCancel}>← 취소</button>
        <span className="muted">상대: <b>{watch.opponent.name}</b> (평균 CA {avgCA(watch.opponent)})</span>
      </div>

      <div className="watch-2col">
        <div>
          <ScoreboardHero
            homeName={homeName} awayName={awayName} score={view.score} minute={view.minute}
            phase={phase} kit={kit} userIsHome={watch.userIsHome} goalFlash={goalFlash}
            isDerby={isDerby} isFinal={isFinal}
          />
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
                  {WATCH_SPEEDS.map((s) => (
                    <button
                      key={s}
                      className={prefs.speed === s ? 'speed-btn active' : 'speed-btn'}
                      onClick={() => updatePrefs({ speed: s })}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
                <button
                  className="btn-ghost"
                  onClick={skipToNextEvent}
                  title="다음 슈팅·카드·부상 장면까지 건너뛰고 일시정지"
                >
                  ▶▶ 다음 장면
                </button>
                <button className="btn-ghost" onClick={() => skipMinutes(5)} title="5분 빠르게 진행">
                  +5분
                </button>
                <button className="btn-ghost" onClick={skip}>
                  {phase === 'playing' ? '하프타임' : '경기 종료'}까지 ▶▶
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => setSubModalOpen(true)}
                  disabled={subsUsed >= SUB_LIMIT}
                  title={subsUsed >= SUB_LIMIT ? '교체 카드를 모두 사용했습니다' : '선수 교체'}
                >
                  🔄 교체 ({subsUsed}/{SUB_LIMIT})
                </button>
                <button
                  className={tacticPanelOpen ? 'btn-ghost tactic-panel-btn open' : 'btn-ghost tactic-panel-btn'}
                  onClick={tacticPanelOpen ? closeTacticPanel : openTacticPanel}
                  title="경기를 멈추고 전술(포메이션·슬라이더·개인 지시)을 조정합니다"
                >
                  📋 전술 {tacticPanelOpen ? '닫기' : ''}
                </button>
                <span className="watch-toggles">
                  <label className="watch-toggle" title="골이 터지면 자동으로 일시정지해 전술을 다시 생각할 시간을 줍니다">
                    <input
                      type="checkbox"
                      checked={prefs.pauseOnGoal}
                      onChange={(e) => updatePrefs({ pauseOnGoal: e.target.checked })}
                    />
                    골 후 정지
                  </label>
                  <label className="watch-toggle" title="카드(옐로/레드)가 나오면 자동으로 일시정지합니다">
                    <input
                      type="checkbox"
                      checked={prefs.pauseOnCard}
                      onChange={(e) => updatePrefs({ pauseOnCard: e.target.checked })}
                    />
                    카드 후 정지
                  </label>
                </span>
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

          {(phase === 'playing' || phase === 'playing2') && (
            <div className="quick-bar">
              <span className="qb-label" title="슬라이더를 열지 않고 팀 성향을 한 번에 바꿉니다">멘탈리티</span>
              <div className="speed-toggle mentality-stepper">
                {MENTALITY_STEPS.map((s) => (
                  <button
                    key={s.label}
                    className={nearestMentality === s.value ? 'speed-btn active' : 'speed-btn'}
                    onClick={() => applyQuickTactic({ mentality: s.value }, `멘탈리티 → ${s.label}`)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <span className="qb-sep" aria-hidden="true" />
              {QUICK_PRESETS.map((p) => (
                <button
                  key={p.key}
                  className={[
                    'btn-ghost', 'btn-quick', p.tone ? `quick-tactic ${p.tone}` : '',
                    (p.tone === 'chase' && userBehind) || (p.tone === 'protect' && userAhead) ? 'suggested' : '',
                  ].filter(Boolean).join(' ')}
                  title={p.title}
                  onClick={() => applyQuickTactic(p.values, p.label)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
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

          ) : tacticPanelOpen && (phase === 'playing' || phase === 'playing2') ? (
            <>
              <div className="ht-banner">⏸ {view.minute}' 경기 일시정지 — 전술을 조정하세요 (변경 즉시 반영)</div>
              <Tactics club={myClub} tactic={tactic} onChange={handleLiveTacticChange} />
              <button className="btn-advance" onClick={closeTacticPanel}>적용하고 경기 재개 ▶</button>
            </>
          ) : (
            <div className="commentary">
              <BenchPanel
                club={myClub}
                tactic={tactic}
                subsUsed={subsUsed}
                subLimit={SUB_LIMIT}
                subPriority={subPriority}
                onReorderPriority={handleReorderSubPriority}
                onSubstitute={performSubstitution}
              />
              <LiveStatsPanel stats={stats} homeName={homeName} awayName={awayName} userSide={userSide} />
              {aiHalftimeNote && <p className="muted small ai-halftime-note">🔄 {aiHalftimeNote}</p>}
              <h3>중계</h3>
              <Feed events={feed} injuries={injuryFeed} cards={cardFeed} tacticLog={tacticLog} userSide={userSide} />
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

/**
 * 피치 위 HTML 스코어보드 히어로 — 이전에는 캔버스 안에 작은 반투명 바로 그려
 * 구단명이 잘리고 스코어가 눈에 안 들어왔다. 킷 색상 스와치·경기 국면·분 표시를
 * 한곳에 모으고, 골이 터지면 보드 전체가 초록 글로우로 펄스한다.
 */
function ScoreboardHero({
  homeName, awayName, score, minute, phase, kit, userIsHome, goalFlash, isDerby, isFinal,
}: {
  homeName: string; awayName: string; score: [number, number]; minute: number;
  phase: Phase; kit: ReturnType<typeof resolveKitColors>; userIsHome: boolean;
  goalFlash: 'home' | 'away' | null; isDerby: boolean; isFinal: boolean;
}) {
  const cls = [
    'sb-hero',
    isFinal ? 'final' : isDerby ? 'derby' : '',
    goalFlash ? 'goal-pulse' : '',
  ].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className="sbh-team home">
        <span className={userIsHome ? 'sbh-name mine' : 'sbh-name'}>{homeName}</span>
        <span className="sbh-kit" style={{ background: kit.home }} aria-hidden="true" />
      </div>
      <div className="sbh-center">
        <div className="sbh-score">
          {score[0]}<span className="sbh-colon">:</span>{score[1]}
        </div>
        <div className="sbh-sub">
          {isFinal && <span className="sbh-badge final">🏆 결승</span>}
          {!isFinal && isDerby && <span className="sbh-badge derby">🔥 라이벌전</span>}
          {(phase === 'playing' || phase === 'playing2') && <span className="sbh-minute">{minute}'</span>}
          <span className="sbh-phase">{PHASE_LABEL[phase]}</span>
        </div>
      </div>
      <div className="sbh-team away">
        <span className="sbh-kit" style={{ background: kit.away }} aria-hidden="true" />
        <span className={!userIsHome ? 'sbh-name mine' : 'sbh-name'}>{awayName}</span>
      </div>
    </div>
  );
}

/** 라인업 슬롯 하나(벤치 교체 드래그 드롭 대상, D27) — 상시 노출되는 미니 라인업 목록의 한 행. */
function BenchLineupRow({ index, position, player }: {
  index: number; position: string; player: Player | undefined;
}) {
  const { setNodeRef, isOver } = useDroppableZone(`lineup-slot-${index}`, { slotIndex: index });
  return (
    <div ref={setNodeRef} className={`bench-lineup-row dnd-drop-zone${isOver ? ' drop-over' : ''}`}>
      <span className="blr-pos">{position}</span>
      <span className="blr-name">{player ? player.name : '(선수 없음)'}</span>
    </div>
  );
}

/** 드래그 가능한 벤치 선수 칩(D27/D28) — 라인업 위로 드래그하면 교체, 칩끼리 재정렬하면 우선순위 변경. */
function BenchChip({ player, disabled }: { player: Player; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `bench-${player.id}`, disabled,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <div
      ref={setNodeRef} {...attributes} {...listeners} style={style}
      className={`roster-chip dnd-draggable${isDragging ? ' dragging' : ''}`}
      title={disabled
        ? `${player.name} · 교체 카드를 모두 사용했습니다`
        : `${player.name} · ${player.position} · CA ${currentAbility(player).toFixed(0)} — 드래그해서 순서 변경 또는 라인업에 투입`}
    >
      <span className="rc-name">{player.name}</span>
      <span className="rc-pos muted small">{player.position}</span>
      <span className="rc-ca">{currentAbility(player).toFixed(0)}</span>
    </div>
  );
}

/** 관전 중 상시 노출되는 벤치 패널(선수관리 전면 도입 D27/D28) — 미니 라인업 위로
 *  벤치 선수를 드래그하면 즉시 교체하고, 벤치 칩끼리 드래그로 순서를 바꾸면
 *  그 순서가 "선호 교체 우선순위"로 저장돼 다음 경기에도 이어진다. */
function BenchPanel({
  club, tactic, subsUsed, subLimit, subPriority, onReorderPriority, onSubstitute,
}: {
  club: Club; tactic: Tactic; subsUsed: number; subLimit: number;
  subPriority: string[];
  onReorderPriority: (order: string[]) => void;
  onSubstitute: (outPlayerId: string, inPlayerId: string) => void;
}) {
  const exhausted = subsUsed >= subLimit;
  const benchPlayers = sortByPriority(
    club.players.filter((p) => isAvailable(p) && !tactic.lineup.some((s) => s.playerId === p.id)),
    subPriority,
    (p) => currentAbility(p),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const overId = String(over.id);
    const activeId = String(active.id).replace(/^bench-/, '');
    if (overId.startsWith('lineup-slot-')) {
      if (exhausted) return;
      const slotIndex = Number(overId.slice('lineup-slot-'.length));
      const outPlayerId = tactic.lineup[slotIndex]?.playerId;
      if (outPlayerId) onSubstitute(outPlayerId, activeId);
      return;
    }
    const overCleanId = overId.replace(/^bench-/, '');
    if (activeId === overCleanId) return;
    const ids = benchPlayers.map((p) => p.id);
    const from = ids.indexOf(activeId);
    const to = ids.indexOf(overCleanId);
    if (from < 0 || to < 0) return;
    onReorderPriority(arrayMove(ids, from, to));
  }

  return (
    <div className="bench-panel">
      <h3>🪑 벤치{exhausted && <span className="muted small"> (교체 카드 소진)</span>}</h3>
      <DndScope onDragEnd={handleDragEnd}>
        <div className="bench-lineup-mini">
          {tactic.lineup.map((slot, i) => (
            <BenchLineupRow
              key={i}
              index={i}
              position={slot.position}
              player={club.players.find((p) => p.id === slot.playerId)}
            />
          ))}
        </div>
        <div className="label small">벤치 — 드래그로 순서 변경(교체 우선순위) · 라인업 위로 드래그하면 교체</div>
        <SortableContext items={benchPlayers.map((p) => `bench-${p.id}`)} strategy={verticalListSortingStrategy}>
          <div className="lineup-roster-list">
            {benchPlayers.length === 0 ? (
              <p className="muted small">교체 가능한 벤치 선수가 없습니다.</p>
            ) : benchPlayers.map((p) => (
              <BenchChip key={p.id} player={p} disabled={exhausted} />
            ))}
          </div>
        </SortableContext>
      </DndScope>
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
  | { kind: 'injury'; minute: number; ev: InjuryEvent }
  | { kind: 'card'; minute: number; ev: CardEvent }
  | { kind: 'tactic'; minute: number; ev: { minute: number; text: string } };

function Feed({
  events, injuries, cards, tacticLog, userSide,
}: {
  events: MatchEvent[]; injuries: InjuryEvent[]; cards: CardEvent[];
  tacticLog: { minute: number; text: string }[]; userSide: 'home' | 'away';
}) {
  const items: FeedItem[] = [
    ...events.map((ev): FeedItem => ({ kind: 'match', minute: ev.minute, ev })),
    ...injuries.map((ev): FeedItem => ({ kind: 'injury', minute: ev.minute, ev })),
    ...cards.map((ev): FeedItem => ({ kind: 'card', minute: ev.minute, ev })),
    ...tacticLog.map((ev): FeedItem => ({ kind: 'tactic', minute: ev.minute, ev })),
  ];
  // 각 목록은 이미 최신순으로 쌓이므로, 삽입 순서를 보존하며 안정적으로 합친다.
  items.sort((a, b) => b.minute - a.minute);
  if (items.length === 0) return <p className="muted small">아직 주요 장면이 없습니다.</p>;
  return (
    <ul className="feed">
      {items.map((it, idx) => it.kind === 'tactic' ? (
        <li key={`tactic-${it.minute}-${idx}`} className="tactic-feed">
          <span className="feed-min">{it.minute}'</span>
          <span className="feed-text">📋 {it.ev.text}</span>
        </li>
      ) : it.kind === 'match' ? (
        <li
          key={`match-${it.ev.minute}-${it.ev.playerId}`}
          className={(it.ev.outcome === 'GOAL' || it.ev.outcome === 'OWN_GOAL')
            ? (it.ev.side === userSide ? 'goal mine' : 'goal') : ''}
        >
          <span className="feed-min">{it.ev.minute}'</span>
          <span className="feed-text">{it.ev.playerName} — {OUTCOME[it.ev.outcome]}</span>
        </li>
      ) : it.kind === 'injury' ? (
        <li key={`injury-${it.ev.minute}-${it.ev.playerId}`} className="injury-feed">
          <span className="feed-min">{it.ev.minute}'</span>
          <span className="feed-text">
            🚑 {it.ev.playerName} {SEVERITY_LABEL[it.ev.severity]} 부상 ({it.ev.name})
            {it.ev.side === userSide && <span className="muted small"> — 예상 결장 {it.ev.matches}경기</span>}
          </span>
        </li>
      ) : (
        <li key={`card-${it.ev.minute}-${it.ev.playerId}-${it.ev.type}`} className="card-feed">
          <span className="feed-min">{it.ev.minute}'</span>
          <span className="feed-text">
            {it.ev.type === 'red' ? '🟥' : '🟨'} {it.ev.playerName}
            {it.ev.type === 'red' && <span className="muted small"> — 퇴장</span>}
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
      {result.stoppage && (
        <p
          className="ft-stoppage muted small"
          title="카드·부상·득점 세리머니 등 실제 지연 요인을 반영한 표시용 추가시간(고도화 항목58)"
        >
          ⏱️ 추가시간 전반 +{result.stoppage.first}분 · 후반 +{result.stoppage.second}분
        </p>
      )}
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

/** 전술 스냅샷 diff 요약(M2 E1) — 포메이션과 슬라이더 5종의 변경만 짧게 적는다. */
function describeTacticDiff(prev: Tactic, next: Tactic): string | null {
  const parts: string[] = [];
  if (prev.formation !== next.formation) parts.push(`포메이션 ${prev.formation} → ${next.formation}`);
  (Object.keys(SLIDER_LABEL) as SliderKey[]).forEach((k) => {
    if (prev[k] !== next[k]) {
      parts.push(`${SLIDER_LABEL[k]} ${Math.round(prev[k] * 100)} → ${Math.round(next[k] * 100)}`);
    }
  });
  return parts.length ? `전술 변경: ${parts.join(' · ')}` : null;
}

/** 등번호가 없으므로 이름 이니셜 2자로 피치 위 선수를 구분한다. */
function playerInitials(club: Club, playerId: string): string {
  const player = club.players.find((p) => p.id === playerId);
  if (!player) return '';
  const parts = player.name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return player.name.slice(0, 2).toUpperCase();
}
