import { describe, it, expect } from 'vitest';
import {
  startGame, startSeason, playRestOfSeason, finishSeason, declareBoldPredictionAction,
} from '../src/game.js';
import { boldPredictionTarget } from '@soccer-tycoon/engine';

describe('신규 개선 항목 25: 대담한 목표 공개 선언 (앱 통합)', () => {
  it('프리시즌(경기 시작 전)에는 선언할 수 없다(시즌이 아직 시작되지 않았으므로)', () => {
    const g = startGame(2026, 'c0');
    const outcome = declareBoldPredictionAction(g);
    expect(outcome.ok).toBe(false);
  });

  it('시즌이 시작됐지만 첫 경기 전이면 선언할 수 있고, 목표는 이사회 목표보다 마진만큼 높다', () => {
    const g = startSeason(startGame(2027, 'c0'));
    const outcome = declareBoldPredictionAction(g);
    expect(outcome.ok).toBe(true);
    expect(outcome.state.boldPrediction).toBe(boldPredictionTarget(g.objective));
  });

  it('이미 선언했으면 다시 선언할 수 없다', () => {
    const g = startSeason(startGame(2028, 'c0'));
    const outcome1 = declareBoldPredictionAction(g);
    expect(outcome1.ok).toBe(true);
    const outcome2 = declareBoldPredictionAction(outcome1.state);
    expect(outcome2.ok).toBe(false);
  });

  it('시즌을 마치면 boldPrediction 필드가 초기화되고 summary에 결과가 남는다', () => {
    const g0 = startSeason(startGame(2029, 'c0'));
    const outcome = declareBoldPredictionAction(g0);
    expect(outcome.ok).toBe(true);
    const declaredTarget = outcome.state.boldPrediction;
    expect(declaredTarget).toBeDefined();

    const g1 = finishSeason(playRestOfSeason(outcome.state));
    expect(g1.boldPrediction).toBeUndefined();
    const last = g1.history.at(-1)!;
    expect(last.boldPrediction).toBeDefined();
    expect(last.boldPrediction!.declaredTarget).toBe(declaredTarget);
  });

  it('선언하지 않은 시즌은 summary에 boldPrediction이 없다', () => {
    const g0 = startSeason(startGame(2030, 'c0'));
    const g1 = finishSeason(playRestOfSeason(g0));
    const last = g1.history.at(-1)!;
    expect(last.boldPrediction).toBeUndefined();
  });
});
