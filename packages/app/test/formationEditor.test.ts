import { describe, it, expect } from 'vitest';
import type { Position } from '@soccer-tycoon/engine';
import { mirrorSymmetry } from '../src/formationEditor.js';

describe('mirrorSymmetry: 좌우 대칭 맞춤(선수관리 개선 항목37)', () => {
  it('이미 대칭인 백4는 그대로 유지된다', () => {
    const outfield: Position[] = ['DL', 'DC', 'DC', 'DR', 'MC', 'MC', 'MC', 'AML', 'ST', 'AMR'];
    expect(mirrorSymmetry(outfield)).toEqual(outfield);
  });

  it('한쪽으로 쏠린 편측 슬롯 쌍은 거울상으로 맞춰진다', () => {
    // AML이 둘, AMR이 없는 상태 — 항목37 도구가 하나를 AMR로 뒤집어야 한다.
    const outfield: Position[] = ['DL', 'DC', 'DC', 'DR', 'MC', 'MC', 'MC', 'AML', 'ST', 'AML'];
    const fixed = mirrorSymmetry(outfield);
    const amlCount = fixed.filter((p) => p === 'AML').length;
    const amrCount = fixed.filter((p) => p === 'AMR').length;
    expect(amlCount).toBe(1);
    expect(amrCount).toBe(1);
  });

  it('짝이 없는 편측 슬롯(예: DR만 있고 DL이 없음)은 중앙 포지션으로 뭉개지지 않고 그대로 남는다', () => {
    const outfield: Position[] = ['ST', 'DC', 'DC', 'DR', 'MC', 'MC', 'MC', 'AML', 'ST', 'AMR'];
    const fixed = mirrorSymmetry(outfield);
    // DR은 짝(DL)이 없어 그대로 남고, DC/MC/ST 등 중앙 포지션도 손대지 않는다.
    expect(fixed).toEqual(outfield);
  });

  it('중앙 포지션(DC/MC/ST)은 항상 그대로 유지된다', () => {
    const outfield: Position[] = ['DC', 'DC', 'DC', 'DC', 'MC', 'MC', 'MC', 'AMC', 'ST', 'ST'];
    expect(mirrorSymmetry(outfield)).toEqual(outfield);
  });
});
