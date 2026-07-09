/**
 * 재개 가능한 라이브 경기 (분 단위 관전 + 하프타임 개입).
 * createContext/stepMinute/finalize를 공유하므로, 전술 변경 없이 끝까지 돌리면
 * simulateMatch와 완전히 동일한 결과를 낸다(재현성 유지).
 */
import {
  createContext, stepMinute, finalize, applyTactic, MATCH_LENGTH,
  type MatchContext, type MatchSetup,
} from './simulateMatch.js';
import type { CardEvent, InjuryEvent, MatchEvent, MatchResult, Tactic } from './types.js';
import type { Weather } from './weather.js';

export const HALF_TIME = Math.floor(MATCH_LENGTH / 2); // 45분

/** 진행 중 실시간 팀 통계(관전 패널용). [홈, 원정]. */
export interface LiveStats {
  possession: [number, number];
  shots: [number, number];
  shotsOnTarget: [number, number];
}

export class LiveMatch {
  private ctx: MatchContext;
  private current = 0; // 진행된 분
  // finalize()는 statMap 평점에 승/패·실점 보정을 "더해서" 반영하므로 비멱등적이다.
  // result()가 여러 번 호출돼도(예: React 렌더마다) 보정이 중복 적용되지 않도록 최초 1회만
  // 계산해 캐시한다 — 경기가 끝난 뒤의 결과는 이후 다시 계산해도 달라질 이유가 없다.
  private cachedResult: MatchResult | null = null;

  constructor(setup: MatchSetup) {
    this.ctx = createContext(setup);
  }

  minute(): number {
    return this.current;
  }

  isDone(): boolean {
    return this.current >= MATCH_LENGTH;
  }

  score(): [number, number] {
    return [this.ctx.home.goals, this.ctx.away.goals];
  }

  /** 경기 날씨(신규 개선 항목 26) — 킥오프 시점에 결정, 관전 중 계속 동일. */
  weather(): Weather {
    return this.ctx.weather;
  }

  /** 현재까지 실시간 통계(점유율·슈팅·유효슈팅). 유효슈팅=골+선방. */
  stats(): LiveStats {
    const { home, away, events } = this.ctx;
    const totalTicks = home.possessionTicks + away.possessionTicks || 1;
    const onTarget = (side: 'home' | 'away'): number =>
      events.filter((e) => e.side === side && (e.outcome === 'GOAL' || e.outcome === 'SAVE')).length;
    return {
      possession: [
        Math.round((home.possessionTicks / totalTicks) * 100),
        Math.round((away.possessionTicks / totalTicks) * 100),
      ],
      shots: [home.shots, away.shots],
      shotsOnTarget: [onTarget('home'), onTarget('away')],
    };
  }

  /** 지정 분까지 진행하고, 그 구간에 발생한 이벤트만 반환. */
  runUntil(targetMinute: number): MatchEvent[] {
    const target = Math.min(targetMinute, MATCH_LENGTH);
    const newEvents: MatchEvent[] = [];
    while (this.current < target) {
      this.current++;
      const ev = stepMinute(this.ctx, this.current);
      if (ev) newEvents.push(ev);
    }
    return newEvents;
  }

  /** 전반 종료(45분)까지 진행. */
  runFirstHalf(): MatchEvent[] {
    return this.runUntil(HALF_TIME);
  }

  /** 끝까지 진행. */
  runToEnd(): MatchEvent[] {
    return this.runUntil(MATCH_LENGTH);
  }

  /** 하프타임 등에서 한 팀 전술 교체(누적 스코어는 유지). */
  setTactic(side: 'home' | 'away', tactic: Tactic): void {
    applyTactic(this.ctx, side, tactic, this.current);
  }

  /**
   * 이번 경기 부상 판정 스케줄(킥오프 시점 확정, 언제 호출해도 동일).
   * 라이브 관전 중 분이 지날 때마다 노출해 실시간 알림·긴급 교체에 사용한다.
   */
  injuries(): InjuryEvent[] {
    return this.ctx.injuries;
  }

  /**
   * 이번 경기 카드(옐로/레드) 판정 스케줄(킥오프 시점 확정, 언제 호출해도 동일).
   * 부상과 마찬가지로 라이브 관전 중 분이 지날 때마다 노출한다(고도화 항목 B1).
   */
  cards(): CardEvent[] {
    return this.ctx.cards;
  }

  result(): MatchResult {
    if (!this.cachedResult) this.cachedResult = finalize(this.ctx);
    return this.cachedResult;
  }
}
