/**
 * 재개 가능한 라이브 경기 (분 단위 관전 + 하프타임 개입).
 * createContext/stepMinute/finalize를 공유하므로, 전술 변경 없이 끝까지 돌리면
 * simulateMatch와 완전히 동일한 결과를 낸다(재현성 유지).
 */
import {
  createContext, stepMinute, finalize, applyTactic, MATCH_LENGTH,
  type MatchContext, type MatchSetup,
} from './simulateMatch.js';
import type { MatchEvent, MatchResult, Tactic } from './types.js';

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
    applyTactic(this.ctx, side, tactic);
  }

  result(): MatchResult {
    return finalize(this.ctx);
  }
}
