import { useEffect, useRef, useState } from 'react';
import type { DragEndEvent } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  LiveMatch, HALF_TIME, MATCH_LENGTH, currentAbility, isAvailable, SEVERITY_LABEL,
  CUP_FINAL_ROUND_NAME, decideAiHalftimeTactic, lineOf,
  type Club, type Player, type Tactic, type MatchEvent, type MatchResult, type LiveStats,
  type InjuryEvent, type CardEvent, type TeamTalkTone,
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

/** 이벤트별 중계 문구 후보(M5 D1) — 같은 이벤트는 항상 같은 문구가 나오도록
 *  분·선수 id 해시로 결정적으로 고른다(리렌더에도 안정적). */
const OUTCOME_PHRASES: Record<string, string[]> = {
  GOAL: ['⚽ 골! 그물이 출렁입니다!', '⚽ 골! 완벽한 마무리!', '⚽ 골! 스타디움이 터져 나갑니다!'],
  SAVE: ['🧤 선방! 골키퍼가 막아냅니다', '🧤 슈퍼 세이브!', '🧤 선방 — 슈팅 각도를 지워버립니다'],
  OFF_TARGET: ['➡️ 빗나갑니다', '➡️ 골대를 스치듯 벗어납니다', '➡️ 아깝게 빗나감'],
  BLOCKED: ['🛡️ 수비 블록에 막힙니다', '🛡️ 몸을 던져 막아냅니다', '🛡️ 블록!'],
  OWN_GOAL: ['🥅 자책골! 이런 일이…', '🥅 통한의 자책골'],
};
function phraseFor(ev: MatchEvent): string {
  const list = OUTCOME_PHRASES[ev.outcome] ?? [ev.outcome];
  let h = ev.minute * 31;
  for (const ch of ev.playerId) h = ((h * 33) + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length]!;
}

/** 조용한 구간을 채우는 소프트 중계(M5 D2) — 10분 연속 무이벤트면 하나 흘린다. */
const FLAVOR_LINES = [
  '중원에서 탐색전이 이어집니다',
  '양 팀 모두 신중하게 볼을 돌립니다',
  '측면 돌파를 시도하지만 번번이 끊깁니다',
  '경기 템포가 잠시 가라앉습니다',
];

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

/** 하프타임 팀토크 선택지(M4 B13) — 엔진 applyTeamTalk과 짝을 이룬다. */
const TEAM_TALKS: { tone: TeamTalkTone; label: string; desc: string }[] = [
  { tone: 'encourage', label: '💪 격려', desc: '자신감을 불어넣는다 — 후반 전력 +2%' },
  { tone: 'critic', label: '🗯 질책', desc: '정신 차리게 다그친다 — 지고 있으면 +4% 반등, 아니면 -2% 역효과' },
  { tone: 'calm', label: '🧊 침착', desc: '계획대로 차분히 — 후반 전력 +1%' },
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
  /** 현재 공격 중인(공을 잡은) 팀 — 피치 운동 모델의 전진/후퇴·캐리어 판정에 사용. */
  possession: 'home' | 'away';
}

/** 하이라이트 모드(M6 A6)에서 장면을 보여준 뒤 다음 장면으로 건너뛰기까지의 관찰 시간(ms). */
const HIGHLIGHT_DWELL_MS = 1800;

/** 전술 변경 후 재변경까지 걸리는 경기 시간(분, M4 B11) — 지시가 선수들에게 스며들
 *  시간을 주고, 슬라이더를 매분 흔드는 것이 최적해가 되는 것을 막는다. */
const TACTIC_COOLDOWN_MIN = 5;

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
  const [view, setView] = useState<View>({ minute: 0, frac: 0, score: [0, 0], ball: { x: 0.5, y: 0.5 }, possession: 'home' });
  const [goalFlash, setGoalFlash] = useState<'home' | 'away' | null>(null);
  const goalFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 골 리플레이 오버레이(M5 A11)·세리머니 링(D4)용 — 마지막 득점 정보. */
  const [lastGoal, setLastGoal] = useState<{ side: 'home' | 'away'; name: string; minute: number; slotIndex: number } | null>(null);
  /** 슈팅 궤적선(M7 D5) — 마지막 슈팅의 시작점·결과. 그리기는 캔버스가 시간 기반으로 페이드. */
  const [shotTrail, setShotTrail] = useState<{ side: 'home' | 'away'; fromX: number; fromY: number; outcome: string; start: number } | null>(null);
  /** 교체 보드 오버레이(M7 D10) — 교체 순간 IN/OUT 카드. */
  const [subFlash, setSubFlash] = useState<{ out: string; in: string } | null>(null);
  const subFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 소프트 중계(M5 D2) — 무이벤트 연속 분 카운터와 흘린 문구들. */
  const quietRef = useRef(0);
  const [flavorLog, setFlavorLog] = useState<{ minute: number; text: string }[]>([]);
  const [cardFlash, setCardFlash] = useState<{ side: 'home' | 'away'; slotIndex: number; type: 'yellow' | 'red' } | null>(null);
  const cardFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [injuryFlash, setInjuryFlash] = useState<{ side: 'home' | 'away'; slotIndex: number } | null>(null);
  const injuryFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (goalFlashTimerRef.current) clearTimeout(goalFlashTimerRef.current);
    if (cardFlashTimerRef.current) clearTimeout(cardFlashTimerRef.current);
    if (injuryFlashTimerRef.current) clearTimeout(injuryFlashTimerRef.current);
    if (subFlashTimerRef.current) clearTimeout(subFlashTimerRef.current);
  }, []);
  const [feed, setFeed] = useState<MatchEvent[]>([]);
  const [tactic, setTactic] = useState<Tactic>(initialTactic);
  const [stats, setStats] = useState<LiveStats>({
    possession: [50, 50], shots: [0, 0], shotsOnTarget: [0, 0], bigChances: [0, 0],
  });
  /** 실시간 선수 평점(M3 C1) — 분이 지날 때마다 엔진 statMap에서 갱신. */
  const [ratings, setRatings] = useState<Map<string, number>>(() => live.liveRatings());
  /** 모멘텀(M3 C4) 계산용 전체 이벤트 누적 — 피드(주요 장면만)와 달리 모든 슈팅을 담는다. */
  const allEventsRef = useRef<MatchEvent[]>([]);
  /** 선수별 투입 시점(분) — 체력 추정(C2)에 사용. 선발은 0분, 교체 투입은 그 시점 기록. */
  const entryMinuteRef = useRef<Map<string, number>>(new Map());
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
  const [tacticLog, setTacticLog] = useState<{ minute: number; text: string; shotsAt?: [number, number] }[]>([]);
  const toast = useToast();
  /** 마지막 전술 변경 시각(분, M4 B11) — 쿨다운 계산용. -999 = 아직 변경 없음. */
  const lastTacticChangeRef = useRef(-999);
  /** 하프타임 팀토크(M4 B13) — 경기당 1회. 선택한 어조를 기억해 재선택을 막는다. */
  const [teamTalkUsed, setTeamTalkUsed] = useState<TeamTalkTone | null>(null);
  /** 예약 교체(M4 B16): 지정한 분에 도달하면 자동 실행된다. */
  const [subPlans, setSubPlans] = useState<{ minute: number; outId: string; inId: string }[]>([]);

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
    setView((v) => ({
      minute: target, frac: 0, score: live.score(), ball,
      // 마지막 이벤트의 공격 측을 점유로 삼고, 이벤트 없는 분은 직전 점유를 유지한다.
      possession: last ? last.side : v.possession,
    }));
    if (last) {
      // 슈팅 궤적선(D5): 이 분의 마지막 슈팅을 공 위치에서 골문 방향으로 표시.
      setShotTrail({ side: last.side, fromX: ball.x, fromY: ball.y, outcome: last.outcome, start: performance.now() });
    }
    if (goal) {
      // 틱 주기에 얹으면 다음 틱이 없을 때(하프타임 경계 등) 배너가 얼어붙어
      // 남아있거나, 반대로 다음 틱이 바로 이어지면 한 프레임만 스쳐 지나간다 —
      // 틱과 무관한 고정 지속시간을 직접 타이머로 관리한다.
      if (goalFlashTimerRef.current) clearTimeout(goalFlashTimerRef.current);
      setGoalFlash(goal.side);
      goalFlashTimerRef.current = setTimeout(() => setGoalFlash(null), GOAL_FLASH_MS);
      // 리플레이 오버레이(A11)·세리머니 링(D4)용 득점자 정보 — 자책골은 상대 득점.
      const scorerTactic = goal.side === 'home' ? homeTactic : awayTactic;
      setLastGoal({
        side: goal.side, name: goal.playerName, minute: goal.minute,
        slotIndex: scorerTactic.lineup.findIndex((sl) => sl.playerId === goal.playerId),
      });
      // 골 후 자동 일시정지(M1 A5) — 스코어가 바뀐 순간이 전술을 다시 생각할 시점이다.
      if (allowAutoPause && prefs.pauseOnGoal) setPaused(true);
    }
    setStats(live.stats());
    setRatings(live.liveRatings());
    allEventsRef.current.push(...evs);
    const notable = evs.filter((e) => e.outcome === 'GOAL' || e.outcome === 'OWN_GOAL' || e.outcome === 'SAVE');
    if (notable.length) setFeed((f) => [...notable.reverse(), ...f]);
    // 소프트 중계(D2): 이벤트 없는 분이 10번 이어지면 흐름 문구 하나(스킵 구간 제외).
    if (evs.length > 0 || !allowAutoPause) {
      quietRef.current = 0;
    } else {
      quietRef.current++;
      if (quietRef.current >= 10) {
        quietRef.current = 0;
        setFlavorLog((l) => [{ minute: target, text: FLAVOR_LINES[target % FLAVOR_LINES.length]! }, ...l]);
      }
    }
  }

  // 진행 타이머 — 1분을 SUBTICKS개의 서브틱으로 쪼개 경기 시각(frac)만 잘게 흐르게 한다.
  // 공·선수의 연속 움직임은 이제 피치 운동 모델(matchMotion)이 프레임 단위로 담당하므로,
  // 서브틱은 페이싱(시각 진행)만 맡고 공 위치를 임의로 흔들지 않는다.
  useEffect(() => {
    if (phase !== 'playing' && phase !== 'playing2') return;
    if (prefs.mode === 'highlight') return; // 하이라이트 모드는 아래 전용 루프가 진행(M6 A6)
    if (activeInjury) return; // 부상 교체 프롬프트 응답 전에는 진행 정지
    if (subModalOpen) return; // 자유 교체 창이 열려 있는 동안도 진행 정지
    if (paused) return;
    const id = setInterval(() => {
      if (subtickRef.current < SUBTICKS - 1) {
        subtickRef.current++;
        const frac = subtickRef.current / SUBTICKS;
        setView((v) => ({ ...v, frac }));
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
      executeSubPlans(target);
    }, MINUTE_MS / SUBTICKS / prefs.speed);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, activeInjury, subModalOpen, tactic, paused, prefs]);

  // 하이라이트 관전 모드(M6 A6) — 장면(슈팅·카드·부상)에서 잠시 머무른 뒤 다음
  // 장면으로 자동 점프한다. 조용한 구간은 화면에 존재하지 않는다.
  useEffect(() => {
    if (prefs.mode !== 'highlight') return;
    if (phase !== 'playing' && phase !== 'playing2') return;
    if (activeInjury || subModalOpen || paused) return;
    const t = setTimeout(() => skipToNextEvent(false), HIGHLIGHT_DWELL_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.mode, phase, view.minute, activeInjury, subModalOpen, paused]);

  // 경계(하프타임·풀타임) 전환 + 휘슬 오버레이(M6 D7)
  useEffect(() => {
    if (phase === 'playing' && view.minute >= HALF_TIME) setPhase('halftime');
    if (phase === 'playing2' && view.minute >= MATCH_LENGTH) setPhase('fulltime');
  }, [view.minute, phase]);

  // 키보드 단축키(M6 A9): Space 일시정지 · 1~5 배속 · N 다음 장면 · T 전술 패널.
  // 입력 요소에 포커스가 있거나 모달이 떠 있으면 무시한다.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (phase !== 'playing' && phase !== 'playing2') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (activeInjury || subModalOpen) return;
      if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key >= '1' && e.key <= '5') {
        const sp = WATCH_SPEEDS[Number(e.key) - 1];
        if (sp !== undefined) updatePrefs({ speed: sp });
      } else if (e.key === 'n' || e.key === 'N') {
        skipToNextEvent();
      } else if (e.key === 't' || e.key === 'T') {
        if (tacticPanelOpen) closeTacticPanel();
        else openTacticPanel();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, activeInjury, subModalOpen, tacticPanelOpen, tactic, paused, prefs]);

  /** 전반 종료·경기 종료 순간 잠깐 뜨는 휘슬 오버레이(M6 D7). */
  const [phaseFlash, setPhaseFlash] = useState<string | null>(null);
  useEffect(() => {
    if (phase !== 'halftime' && phase !== 'fulltime') return;
    setPhaseFlash(phase === 'halftime' ? '📢 전반 종료' : '📢 경기 종료');
    const t = setTimeout(() => setPhaseFlash(null), 1600);
    return () => clearTimeout(t);
  }, [phase]);

  function skip() {
    const boundary = phase === 'playing' ? HALF_TIME : MATCH_LENGTH;
    const evs = live.runUntil(boundary);
    minuteRef.current = boundary;
    subtickRef.current = 0;
    applyMinute(boundary, evs, false);
    revealInjuriesUpTo(boundary, tactic, false);
    revealCardsUpTo(boundary, false);
    executeSubPlans(boundary);
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
    executeSubPlans(target);
  }

  /** 다음 주요 장면(슈팅 결과·카드·부상)까지 건너뛰고 그 앞에서 일시정지(M1 A7) —
   *  "조용한 구간은 넘기되, 장면마다 개입할 기회는 남긴다"는 관전 리듬을 만든다. */
  function skipToNextEvent(pauseAtScene = true) {
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
    executeSubPlans(m);
    if (pauseAtScene && m < boundary) setPaused(true);
  }

  /** 라인업 슬롯 교체를 즉시 엔진에 반영(부상 교체·자유 교체 공통 경로). 교체 카드 1장 소모. */
  function performSubstitution(outPlayerId: string, inPlayerId: string) {
    const slotIndex = tactic.lineup.findIndex((s) => s.playerId === outPlayerId);
    if (slotIndex < 0) return;
    const next = swapPlayer(tactic, slotIndex, inPlayerId);
    setTactic(next);
    live.setTactic(userSide, next);
    setSubsUsed((n) => n + 1);
    entryMinuteRef.current.set(inPlayerId, minuteRef.current);
    // 모든 교체(수동·부상·드래그·예약)를 개입 이력(E1)에 남긴다 — 경기 후 타임라인(E5) 재료.
    const outP = myClub.players.find((pl) => pl.id === outPlayerId);
    const inP = myClub.players.find((pl) => pl.id === inPlayerId);
    if (outP && inP) {
      logTactic(`교체: ${outP.name} → ${inP.name}`);
      // 교체 보드 오버레이(M7 D10) — 2초간 IN/OUT 카드.
      if (subFlashTimerRef.current) clearTimeout(subFlashTimerRef.current);
      setSubFlash({ out: outP.name, in: inP.name });
      subFlashTimerRef.current = setTimeout(() => setSubFlash(null), 2000);
    }
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

  /** 전술 변경 이력(E1)에 한 줄 기록 — 변경 시점 슈팅을 함께 저장해 이후 효과(E2)를 보여준다. */
  function logTactic(text: string) {
    const st = live.stats();
    const mineIdx = userSide === 'home' ? 0 : 1;
    setTacticLog((l) => [{
      minute: minuteRef.current, text,
      shotsAt: [st.shots[mineIdx]!, st.shots[1 - mineIdx]!] as [number, number],
    }, ...l]);
  }

  /** 전술 변경 쿨다운 잔여(경기 분, M4 B11). 0이면 변경 가능. */
  const tacticCooldownLeft = Math.max(0, TACTIC_COOLDOWN_MIN - (view.minute - lastTacticChangeRef.current));

  /** 퀵 지시(M2 B3/B4/B5): 지정한 슬라이더만 갈아 끼우고, 이력·토스트로 확인시킨다(E3). */
  function applyQuickTactic(values: QuickTacticValues, label: string) {
    if (tacticCooldownLeft > 0) {
      toast(`지시가 스며드는 중 — ${tacticCooldownLeft}분 후 변경 가능`, false);
      return;
    }
    const next = { ...tactic, ...values };
    setTactic(next);
    live.setTactic(userSide, next);
    logTactic(label);
    toast(`${label} 적용`, true);
    lastTacticChangeRef.current = minuteRef.current;
  }

  /** 하프타임 팀토크 실행(M4 B13) — 엔진에 전력 보정을 적용하고 이력·토스트로 알린다. */
  function giveTeamTalk(tone: TeamTalkTone, label: string) {
    if (teamTalkUsed) return;
    const mul = live.applyTeamTalk(userSide, tone);
    setTeamTalkUsed(tone);
    const pct = ((mul - 1) * 100).toFixed(0);
    const sign = mul >= 1 ? '+' : '';
    logTactic(`팀토크: ${label} (후반 전력 ${sign}${pct}%)`);
    toast(`${label} — 후반 전력 ${sign}${pct}%`, mul >= 1);
  }

  /** 인게임 전술 패널 열기(B1/B2) — 경기를 멈추고 생각할 시간을 확보한다. */
  function openTacticPanel() {
    if (tacticCooldownLeft > 0) {
      toast(`지시가 스며드는 중 — ${tacticCooldownLeft}분 후 변경 가능`, false);
      return;
    }
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
        lastTacticChangeRef.current = minuteRef.current;
      }
    }
    tacticSnapshotRef.current = null;
    setTacticPanelOpen(false);
    setPaused(false);
  }

  /** 교체 예약 추가(M4 B16) — 지정한 분에 도달하면 자동 실행된다. */
  const subPlansRef = useRef(subPlans);
  function addSubPlan(outId: string, inId: string, minute: number) {
    const next = [...subPlansRef.current, { minute, outId, inId }];
    subPlansRef.current = next;
    setSubPlans(next);
    const outP = myClub.players.find((p) => p.id === outId);
    const inP = myClub.players.find((p) => p.id === inId);
    toast(`${minute}' 교체 예약: ${outP?.name} → ${inP?.name}`, true);
  }
  function cancelSubPlan(index: number) {
    const next = subPlansRef.current.filter((_, i) => i !== index);
    subPlansRef.current = next;
    setSubPlans(next);
  }

  /** 예약 교체 실행 — 분이 지날 때마다 대기열을 확인한다. 조건이 깨졌으면(선수 이미
   *  교체됨·카드 소진 등) 조용히 버리지 않고 토스트로 사유를 알린다. */
  function executeSubPlans(target: number) {
    const due = subPlansRef.current.filter((p) => p.minute <= target);
    if (!due.length) return;
    const rest = subPlansRef.current.filter((p) => p.minute > target);
    subPlansRef.current = rest;
    setSubPlans(rest);
    for (const plan of due) {
      if (subsUsed >= SUB_LIMIT) { toast('예약 교체 실패 — 교체 카드 소진', false); continue; }
      const outP = myClub.players.find((p) => p.id === plan.outId);
      const inP = myClub.players.find((p) => p.id === plan.inId);
      const outOnPitch = tactic.lineup.some((s) => s.playerId === plan.outId);
      const inAvailable = !!inP && isAvailable(inP) && !tactic.lineup.some((s) => s.playerId === plan.inId);
      if (!outP || !outOnPitch || !inAvailable) {
        toast('예약 교체 취소 — 선수 상태가 바뀌었습니다', false);
        continue;
      }
      performSubstitution(plan.outId, plan.inId); // 교체 이력은 공통 경로에서 기록된다
      toast(`예약 교체 실행: ${inP.name} 투입`, true);
    }
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

  /** 경고(옐로) 보유 선수(M3 C3) — 공개된 카드 피드에서 파생. 레드는 이미 퇴장 처리. */
  const yellowIds = new Set(cardFeed.filter((c) => c.type === 'yellow' && c.side === userSide).map((c) => c.playerId));

  /** 체력 추정(M3 C2) — 표시 전용. 킥오프 컨디션에서 출전 시간·전술 강도만큼 깎는다.
   *  엔진 시뮬레이션에는 영향을 주지 않는 파생 지표라 "추정"으로 명시한다. */
  function staminaEstimate(p: Player): number {
    const entered = entryMinuteRef.current.get(p.id) ?? 0;
    const minutesOn = Math.max(0, view.minute - entered);
    const intensity = (tactic.tempo + tactic.pressing) / 2;
    const drainPerMin = 0.0035 + 0.003 * intensity;
    return Math.max(0, Math.min(1, p.condition - minutesOn * drainPerMin));
  }

  /** 최근 10분 모멘텀(M3 C4) — 슈팅 이벤트 가중 합(골 3·유효 2·기타 1)의 내 팀 비중. */
  const momentum = (() => {
    const from = view.minute - 10;
    let mine = 0, opp = 0;
    for (const e of allEventsRef.current) {
      if (e.minute <= from) continue;
      const w = e.outcome === 'GOAL' ? 3 : e.outcome === 'SAVE' || e.outcome === 'OWN_GOAL' ? 2 : 1;
      if (e.side === userSide) mine += w;
      else opp += w;
    }
    return mine + opp === 0 ? 0.5 : mine / (mine + opp);
  })();

  /** 코치 제안(M3 C7) — 지금 데이터로 판단 가능한 조언 최대 2개. */
  const coachTips = (() => {
    const tips: string[] = [];
    if (phase !== 'playing' && phase !== 'playing2') return tips;
    const m = view.minute;
    if (subsUsed < SUB_LIMIT) {
      const tired = tactic.lineup
        .map((s) => myClub.players.find((p) => p.id === s.playerId))
        .find((p) => p && staminaEstimate(p) < 0.35);
      if (tired) tips.push(`${tired.name} 체력 저하 — 교체를 고려하세요`);
    }
    if (m >= 30) {
      let worst: { name: string; r: number } | null = null;
      for (const s of tactic.lineup) {
        const r = ratings.get(s.playerId);
        const p = myClub.players.find((pl) => pl.id === s.playerId);
        if (r !== undefined && p && r <= 5.4 && (!worst || r < worst.r)) worst = { name: p.name, r };
      }
      if (worst) tips.push(`${worst.name} 부진(평점 ${worst.r.toFixed(1)}) — 교체 고려`);
    }
    const yellowDef = tactic.lineup.find((s) => yellowIds.has(s.playerId) && lineOf(s.position) === 'DEF');
    if (yellowDef) {
      const p = myClub.players.find((pl) => pl.id === yellowDef.playerId);
      if (p) tips.push(`경고 보유 수비수 ${p.name} — 퇴장 위험을 관리하세요`);
    }
    if (userBehind && m >= 65) tips.push('뒤지고 있습니다 — 🔥 추격 프리셋을 고려하세요');
    if (userAhead && m >= 80) tips.push('리드 막판 — 🛡 리드 지키기·⏳ 시간 끌기를 고려하세요');
    return tips.slice(0, 2);
  })();
  const pitch: PitchState = {
    homeName, awayName, score: view.score, minute: view.minute + view.frac,
    ball: view.ball, goalFlash, cardFlash, injuryFlash, userIsHome: watch.userIsHome,
    goalCelebrate: goalFlash && lastGoal && lastGoal.slotIndex >= 0
      ? { side: lastGoal.side, slotIndex: lastGoal.slotIndex } : null,
    shotTrail,
    weather: live.weather(),
    possession: view.possession,
    homeFormation: homeTactic.lineup.map((s) => s.position),
    awayFormation: awayTactic.lineup.map((s) => s.position),
    homeLabels: homeTactic.lineup.map((slot) => playerInitials(homeClub, slot.playerId)),
    awayLabels: awayTactic.lineup.map((slot) => playerInitials(awayClub, slot.playerId)),
    // 선수 능력치 → 운동 파라미터: pace/가속은 이동 속도, offTheBall은 침투 런 성향.
    homePace: homeTactic.lineup.map((slot) => paceFactor(homeClub, slot.playerId)),
    awayPace: awayTactic.lineup.map((slot) => paceFactor(awayClub, slot.playerId)),
    homeRun: homeTactic.lineup.map((slot) => runFactor(homeClub, slot.playerId)),
    awayRun: awayTactic.lineup.map((slot) => runFactor(awayClub, slot.playerId)),
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
          <div className="pitch-wrap">
            <MatchPitch {...pitch} />
            {goalFlash && lastGoal && (
              <div className="goal-overlay" aria-live="polite">
                <div className="go-title">⚽ GOAL!</div>
                <div className="go-scorer">{lastGoal.minute}' {lastGoal.name}</div>
                <div className="go-score">{homeName} {view.score[0]} : {view.score[1]} {awayName}</div>
              </div>
            )}
            {!goalFlash && phaseFlash && (
              <div className="goal-overlay phase-overlay" aria-live="polite">
                <div className="po-title">{phaseFlash}</div>
                <div className="go-score">{homeName} {view.score[0]} : {view.score[1]} {awayName}</div>
              </div>
            )}
            {!goalFlash && !phaseFlash && subFlash && (
              <div className="sub-overlay" aria-live="polite">
                <span className="so-out">▼ {subFlash.out}</span>
                <span className="so-in">▲ {subFlash.in}</span>
              </div>
            )}
          </div>
          <div className="watch-controls">
            {phase === 'ready' && (
              <button className="btn-advance big" onClick={() => setPhase('playing')}>킥오프 ▶</button>
            )}
            {(phase === 'playing' || phase === 'playing2') && (
              <>
                <button className="btn-ghost" onClick={() => setPaused((p) => !p)}>
                  {paused ? '▶ 재개' : '⏸ 일시정지'}
                </button>
                <div className="speed-toggle" title="전체: 전 구간 실시간 · 하이라이트: 장면 사이 자동 스킵">
                  <button
                    className={prefs.mode === 'full' ? 'speed-btn active' : 'speed-btn'}
                    onClick={() => updatePrefs({ mode: 'full' })}
                  >
                    전체
                  </button>
                  <button
                    className={prefs.mode === 'highlight' ? 'speed-btn active' : 'speed-btn'}
                    onClick={() => updatePrefs({ mode: 'highlight' })}
                  >
                    하이라이트
                  </button>
                </div>
                {prefs.mode === 'full' && (
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
                )}
                <button
                  className="btn-ghost"
                  onClick={() => skipToNextEvent()}
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
                  disabled={!tacticPanelOpen && tacticCooldownLeft > 0}
                  title={!tacticPanelOpen && tacticCooldownLeft > 0
                    ? `지시 전달 중 — ${tacticCooldownLeft}분 후 변경 가능`
                    : '경기를 멈추고 전술(포메이션·슬라이더·개인 지시)을 조정합니다'}
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
                    disabled={tacticCooldownLeft > 0}
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
                  disabled={tacticCooldownLeft > 0}
                  onClick={() => applyQuickTactic(p.values, p.label)}
                >
                  {p.label}
                </button>
              ))}
              {tacticCooldownLeft > 0 && (
                <span className="qb-cooldown" title="방금 바꾼 지시가 선수들에게 전달되는 중입니다">
                  ⏳ 지시 전달 중 · {tacticCooldownLeft}분
                </span>
              )}
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
              <div className="team-talk">
                <h3>🎙 팀토크 {teamTalkUsed && <span className="muted small">(전달 완료)</span>}</h3>
                {teamTalkUsed ? (
                  <p className="muted small">
                    {TEAM_TALKS.find((t) => t.tone === teamTalkUsed)?.label} — 라커룸의 말은 한 번뿐입니다.
                  </p>
                ) : (
                  <div className="team-talk-options">
                    {TEAM_TALKS.map((t) => (
                      <button key={t.tone} className="btn-ghost team-talk-btn" title={t.desc}
                        onClick={() => giveTeamTalk(t.tone, t.label)}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <HalftimeReport
                stats={stats} ratings={ratings} tactic={tactic} club={myClub}
                userSide={userSide} myGoals={myGoals} oppGoals={oppGoals}
              />
              <LiveStatsPanel stats={stats} homeName={homeName} awayName={awayName} userSide={userSide} momentum={momentum} />
              <Tactics club={myClub} tactic={tactic} onChange={setTactic} />
            </>
          ) : phase === 'fulltime' ? (
            <FullTime
              result={live.result()} homeName={homeName} awayName={awayName} score={view.score}
              myClubId={myClub.id} isDerby={isDerby} isFinal={isFinal} userIsHome={watch.userIsHome}
              aiHalftimeNote={aiHalftimeNote} tacticLog={tacticLog}
            />

          ) : tacticPanelOpen && (phase === 'playing' || phase === 'playing2') ? (
            <>
              <div className="ht-banner">⏸ {view.minute}' 경기 일시정지 — 전술을 조정하세요 (변경 즉시 반영)</div>
              <Tactics club={myClub} tactic={tactic} onChange={handleLiveTacticChange} />
              <button className="btn-advance" onClick={closeTacticPanel}>적용하고 경기 재개 ▶</button>
            </>
          ) : (
            <div className="commentary">
              {coachTips.length > 0 && (
                <div className="coach-tips">
                  {coachTips.map((t) => <p key={t}>💡 {t}</p>)}
                </div>
              )}
              <BenchPanel
                club={myClub}
                tactic={tactic}
                subsUsed={subsUsed}
                subLimit={SUB_LIMIT}
                subPriority={subPriority}
                onReorderPriority={handleReorderSubPriority}
                onSubstitute={performSubstitution}
                ratings={ratings}
                staminaOf={staminaEstimate}
                yellowIds={yellowIds}
                subPlans={subPlans}
                onCancelPlan={cancelSubPlan}
              />
              <LiveStatsPanel stats={stats} homeName={homeName} awayName={awayName} userSide={userSide} momentum={momentum} />
              {aiHalftimeNote && <p className="muted small ai-halftime-note">🔄 {aiHalftimeNote}</p>}
              <h3>중계</h3>
              <Feed
                events={feed} injuries={injuryFeed} cards={cardFeed} tacticLog={tacticLog}
                flavorLog={flavorLog}
                currentShots={[stats.shots[userSide === 'home' ? 0 : 1]!, stats.shots[userSide === 'home' ? 1 : 0]!]}
                userSide={userSide}
              />
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
          currentMinute={view.minute}
          onConfirm={confirmFreeSubstitution}
          onReserve={(outId, inId, minute) => { addSubPlan(outId, inId, minute); setSubModalOpen(false); }}
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
        <div className="sbh-score" key={`${score[0]}-${score[1]}`}>
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

/** 라인업 슬롯 하나(벤치 교체 드래그 드롭 대상, D27) — 상시 노출되는 미니 라인업 목록의 한 행.
 *  M3(C1/C2/C3): 실시간 평점·체력 추정 바·경고 보유 표시가 붙어 교체 판단 근거가 된다. */
function BenchLineupRow({ index, position, player, rating, stamina, hasYellow }: {
  index: number; position: string; player: Player | undefined;
  rating?: number; stamina?: number; hasYellow?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppableZone(`lineup-slot-${index}`, { slotIndex: index });
  const ratingCls = rating === undefined ? '' : rating >= 7 ? ' good' : rating <= 5.7 ? ' poor' : '';
  return (
    <div ref={setNodeRef} className={`bench-lineup-row dnd-drop-zone${isOver ? ' drop-over' : ''}`}>
      <span className="blr-pos">{position}</span>
      <span className="blr-name">
        {hasYellow && <span className="blr-yellow" title="경고 보유 — 다음 경고 시 퇴장">🟨</span>}
        {player ? player.name : '(선수 없음)'}
      </span>
      {rating !== undefined && (
        <span className={`blr-rating${ratingCls}`} title="실시간 평점">{rating.toFixed(1)}</span>
      )}
      {stamina !== undefined && (
        <span className="blr-stamina" title={`체력(추정) ${Math.round(stamina * 100)}%`}>
          <span
            className={`blr-stamina-fill${stamina < 0.35 ? ' low' : ''}`}
            style={{ width: `${Math.round(stamina * 100)}%` }}
          />
        </span>
      )}
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
  ratings, staminaOf, yellowIds, subPlans, onCancelPlan,
}: {
  club: Club; tactic: Tactic; subsUsed: number; subLimit: number;
  subPriority: string[];
  onReorderPriority: (order: string[]) => void;
  onSubstitute: (outPlayerId: string, inPlayerId: string) => void;
  ratings?: Map<string, number>;
  staminaOf?: (p: Player) => number;
  yellowIds?: Set<string>;
  subPlans?: { minute: number; outId: string; inId: string }[];
  onCancelPlan?: (index: number) => void;
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
      {subPlans && subPlans.length > 0 && (
        <ul className="sub-plans">
          {subPlans.map((plan, i) => {
            const outP = club.players.find((p) => p.id === plan.outId);
            const inP = club.players.find((p) => p.id === plan.inId);
            return (
              <li key={`${plan.minute}-${plan.outId}-${i}`}>
                <span>⏰ {plan.minute}' {outP?.name} → {inP?.name}</span>
                {onCancelPlan && (
                  <button className="btn-ghost sub-plan-cancel" onClick={() => onCancelPlan(i)} title="예약 취소">✕</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <DndScope onDragEnd={handleDragEnd}>
        <div className="bench-lineup-mini">
          {tactic.lineup.map((slot, i) => {
            const player = club.players.find((p) => p.id === slot.playerId);
            return (
              <BenchLineupRow
                key={i}
                index={i}
                position={slot.position}
                player={player}
                rating={ratings?.get(slot.playerId)}
                stamina={player && staminaOf ? staminaOf(player) : undefined}
                hasYellow={yellowIds?.has(slot.playerId) ?? false}
              />
            );
          })}
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
  stats, homeName, awayName, userSide, momentum,
}: {
  stats: LiveStats; homeName: string; awayName: string; userSide: 'home' | 'away';
  /** 최근 10분 흐름에서 내 팀 비중(0~1, M3 C4). 생략하면 표시하지 않는다. */
  momentum?: number;
}) {
  const [hp, ap] = stats.possession;
  const rows: { label: string; h: number; a: number }[] = [
    { label: '슈팅', h: stats.shots[0], a: stats.shots[1] },
    { label: '유효슈팅', h: stats.shotsOnTarget[0], a: stats.shotsOnTarget[1] },
    { label: '빅찬스', h: stats.bigChances[0], a: stats.bigChances[1] },
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
      {momentum !== undefined && (
        <div className="ls-momentum" title="최근 10분 슈팅 이벤트 가중 흐름 — 내 팀 쪽일수록 초록">
          <span className="muted small">최근 10분 흐름</span>
          <div className="ls-momentum-bar">
            <div className="ls-seg mine" style={{ width: `${Math.round(momentum * 100)}%` }} />
            <div className="ls-seg opp" style={{ width: `${Math.round((1 - momentum) * 100)}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

/** 하프타임 리포트(M3 C10) — 전반 수치를 코치의 짧은 코멘트로 번역해 후반 조정의 근거를 준다. */
function HalftimeReport({
  stats, ratings, tactic, club, userSide, myGoals, oppGoals,
}: {
  stats: LiveStats; ratings: Map<string, number>; tactic: Tactic; club: Club;
  userSide: 'home' | 'away'; myGoals: number; oppGoals: number;
}) {
  const idx = userSide === 'home' ? 0 : 1;
  const myPoss = stats.possession[idx];
  const myShots = stats.shots[idx];
  const oppShots = stats.shots[1 - idx]!;
  const lines: string[] = [];

  if (myGoals > oppGoals) lines.push('리드를 잡았습니다 — 이대로면 승점 3점입니다.');
  else if (myGoals < oppGoals) lines.push('뒤지고 있습니다 — 후반에 변화가 필요합니다.');
  else lines.push('팽팽한 균형 — 후반 첫 골이 승부를 가를 겁니다.');

  if (myPoss >= 55) lines.push(`점유율 ${myPoss}%로 주도권을 쥐고 있습니다.`);
  else if (myPoss <= 45) lines.push(`점유율 ${myPoss}% 열세 — 템포·압박 조정을 고려하세요.`);
  if (myShots < oppShots) lines.push(`슈팅 ${myShots}:${oppShots} 열세 — 공격 루트가 막혀 있습니다.`);

  let best: { name: string; r: number } | null = null;
  let worst: { name: string; r: number } | null = null;
  for (const slot of tactic.lineup) {
    const r = ratings.get(slot.playerId);
    const p = club.players.find((pl) => pl.id === slot.playerId);
    if (r === undefined || !p) continue;
    if (!best || r > best.r) best = { name: p.name, r };
    if (!worst || r < worst.r) worst = { name: p.name, r };
  }
  if (best && worst && best.name !== worst.name) {
    lines.push(`전반 최고 ${best.name}(${best.r.toFixed(1)}) · 최저 ${worst.name}(${worst.r.toFixed(1)}).`);
  }

  return (
    <div className="ht-report">
      <h3>📋 전반 리포트</h3>
      {lines.map((l) => <p key={l}>{l}</p>)}
    </div>
  );
}

type FeedItem =
  | { kind: 'match'; minute: number; ev: MatchEvent }
  | { kind: 'injury'; minute: number; ev: InjuryEvent }
  | { kind: 'card'; minute: number; ev: CardEvent }
  | { kind: 'tactic'; minute: number; ev: { minute: number; text: string; shotsAt?: [number, number] } }
  | { kind: 'flavor'; minute: number; ev: { minute: number; text: string } };

function Feed({
  events, injuries, cards, tacticLog, flavorLog, currentShots, userSide,
}: {
  events: MatchEvent[]; injuries: InjuryEvent[]; cards: CardEvent[];
  tacticLog: { minute: number; text: string; shotsAt?: [number, number] }[];
  flavorLog?: { minute: number; text: string }[];
  /** 현재 [내 팀, 상대] 슈팅 — 전술 변경 이후 효과 표시(E2)에 사용. */
  currentShots?: [number, number];
  userSide: 'home' | 'away';
}) {
  const items: FeedItem[] = [
    ...events.map((ev): FeedItem => ({ kind: 'match', minute: ev.minute, ev })),
    ...injuries.map((ev): FeedItem => ({ kind: 'injury', minute: ev.minute, ev })),
    ...cards.map((ev): FeedItem => ({ kind: 'card', minute: ev.minute, ev })),
    ...tacticLog.map((ev): FeedItem => ({ kind: 'tactic', minute: ev.minute, ev })),
    ...(flavorLog ?? []).map((ev): FeedItem => ({ kind: 'flavor', minute: ev.minute, ev })),
  ];
  // 각 목록은 이미 최신순으로 쌓이므로, 삽입 순서를 보존하며 안정적으로 합친다.
  items.sort((a, b) => b.minute - a.minute);
  if (items.length === 0) return <p className="muted small">아직 주요 장면이 없습니다.</p>;
  return (
    <ul className="feed">
      {items.map((it, idx) => it.kind === 'tactic' ? (
        <li key={`tactic-${it.minute}-${idx}`} className="tactic-feed">
          <span className="feed-min">{it.minute}'</span>
          <span className="feed-text">
            📋 {it.ev.text}
            {it.ev.shotsAt && currentShots && (currentShots[0] - it.ev.shotsAt[0] > 0 || currentShots[1] - it.ev.shotsAt[1] > 0) && (
              <span className="muted small"> · 이후 슈팅 {currentShots[0] - it.ev.shotsAt[0]}:{currentShots[1] - it.ev.shotsAt[1]}</span>
            )}
          </span>
        </li>
      ) : it.kind === 'flavor' ? (
        <li key={`flavor-${it.minute}-${idx}`} className="flavor-feed">
          <span className="feed-min">{it.minute}'</span>
          <span className="feed-text muted">{it.ev.text}</span>
        </li>
      ) : it.kind === 'match' ? (
        <li
          key={`match-${it.ev.minute}-${it.ev.playerId}`}
          className={(it.ev.outcome === 'GOAL' || it.ev.outcome === 'OWN_GOAL')
            ? (it.ev.side === userSide ? 'goal mine' : 'goal') : ''}
        >
          <span className="feed-min">{it.ev.minute}'</span>
          <span className="feed-text">{it.ev.playerName} — {phraseFor(it.ev)}</span>
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

/** 부상과 무관하게 관전 중 언제든 선수를 교체하는 모달 — 나갈 선수 → 들어올 선수 2단계 선택.
 *  M4(B16): 즉시 교체 대신 특정 분에 실행되는 "예약"도 걸 수 있다. */
function FreeSubModal({
  club, tactic, subsUsed, subLimit, currentMinute, onConfirm, onReserve, onDismiss,
}: {
  club: Club; tactic: Tactic; subsUsed: number; subLimit: number;
  currentMinute: number;
  onConfirm: (outPlayerId: string, inPlayerId: string) => void;
  onReserve?: (outPlayerId: string, inPlayerId: string, minute: number) => void;
  onDismiss: () => void;
}) {
  const [outId, setOutId] = useState<string | null>(null);
  const [planMinute, setPlanMinute] = useState(() => Math.min(MATCH_LENGTH - 1, currentMinute + 10));
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
            {onReserve && (
              <label className="sub-reserve-minute muted small">
                예약 시각(분) —  "예약"을 누르면 이 시각에 자동 교체됩니다
                <input
                  type="number"
                  min={currentMinute + 1}
                  max={MATCH_LENGTH - 1}
                  value={planMinute}
                  onChange={(e) => setPlanMinute(Number(e.target.value))}
                />
              </label>
            )}
            {bench.length === 0 ? (
              <p className="muted small">교체 가능한 벤치 선수가 없습니다.</p>
            ) : (
              <ul className="sub-list">
                {bench.slice(0, 10).map((p) => (
                  <li key={p.id}>
                    <span>{p.name} ({p.position} · {currentAbility(p).toFixed(0)})</span>
                    <span className="sub-actions">
                      <button className="btn-small" onClick={() => onConfirm(outPlayer.id, p.id)}>교체</button>
                      {onReserve && (
                        <button
                          className="btn-small"
                          disabled={planMinute <= currentMinute || planMinute >= MATCH_LENGTH}
                          onClick={() => onReserve(outPlayer.id, p.id, planMinute)}
                          title={`${planMinute}'에 자동 교체 예약`}
                        >
                          ⏰ 예약
                        </button>
                      )}
                    </span>
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
  result, homeName, awayName, score, myClubId, isDerby, isFinal, userIsHome, aiHalftimeNote, tacticLog,
}: {
  result: MatchResult; homeName: string; awayName: string; score: [number, number]; myClubId: string;
  isDerby: boolean; isFinal: boolean; userIsHome: boolean; aiHalftimeNote: string | null;
  /** 이번 경기 내 개입(전술 변경·팀토크·교체 예약) 타임라인(M5 E5). */
  tacticLog?: { minute: number; text: string }[];
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
      {tacticLog && tacticLog.length > 0 && (
        <div className="intervention-timeline">
          <h3>🧠 개입 타임라인</h3>
          <ul>
            {[...tacticLog].sort((a, b) => a.minute - b.minute).map((t, i) => (
              <li key={`${t.minute}-${i}`}>
                <span className="feed-min">{t.minute}'</span>
                <span>{t.text}</span>
              </li>
            ))}
          </ul>
        </div>
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

function clampNum(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 피치 이동 속도 배율(0.8~1.2) — pace·가속 능력(1~20)에서 파생. 능력치 없으면 1. */
function paceFactor(club: Club, playerId: string): number {
  const p = club.players.find((pl) => pl.id === playerId);
  if (!p) return 1;
  const raw = (p.attributes.pace + p.attributes.acceleration) / 2; // 1~20
  return clampNum(0.8 + (raw / 20) * 0.4, 0.8, 1.2);
}

/** 오프더볼 침투 런 성향(0.2~1.4) — offTheBall 능력에서 파생. 능력치 없으면 0.7. */
function runFactor(club: Club, playerId: string): number {
  const p = club.players.find((pl) => pl.id === playerId);
  if (!p) return 0.7;
  return clampNum((p.attributes.offTheBall / 20) * 1.4, 0.2, 1.4);
}
