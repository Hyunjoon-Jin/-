import { describe, it, expect } from 'vitest';
import {
  loadCustomFormations, saveCustomFormation, deleteCustomFormation, isValidFormationPositions,
} from '../src/customFormations.js';
import type { Position } from '@soccer-tycoon/engine';

/** 실제 브라우저 localStorage를 흉내 내는 최소 목(테스트는 window 없는 Node 환경에서 돈다). */
function mockStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    key: () => null,
    get length() { return map.size; },
  } as Storage;
}

const VALID_11: Position[] = ['GK', 'DL', 'DC', 'DC', 'DR', 'MC', 'MC', 'MC', 'AML', 'ST', 'AMR'];

describe('customFormations: 유효성 판정', () => {
  it('정확히 11슬롯·GK 1명이면 유효', () => {
    expect(isValidFormationPositions(VALID_11)).toBe(true);
  });
  it('슬롯이 11개가 아니면 무효', () => {
    expect(isValidFormationPositions(VALID_11.slice(0, 10))).toBe(false);
  });
  it('GK가 없거나 2명 이상이면 무효', () => {
    expect(isValidFormationPositions(['DL', ...VALID_11.slice(1)])).toBe(false);
    expect(isValidFormationPositions(['GK', 'GK', ...VALID_11.slice(2)])).toBe(false);
  });
});

describe('customFormations: 저장·조회·삭제', () => {
  it('저장한 포메이션을 다시 불러올 수 있다', () => {
    const storage = mockStorage();
    const saved = saveCustomFormation('박스형 스리백', VALID_11, storage);
    expect(saved.length).toBe(1);
    expect(saved[0]!.label).toBe('박스형 스리백');
    expect(loadCustomFormations(storage)).toEqual(saved);
  });

  it('유효하지 않은 포지션 배열은 저장되지 않는다', () => {
    const storage = mockStorage();
    const saved = saveCustomFormation('잘못된 포메이션', VALID_11.slice(0, 9), storage);
    expect(saved.length).toBe(0);
    expect(loadCustomFormations(storage)).toEqual([]);
  });

  it('삭제하면 목록에서 사라진다', () => {
    const storage = mockStorage();
    const saved = saveCustomFormation('테스트', VALID_11, storage);
    const remaining = deleteCustomFormation(saved[0]!.id, storage);
    expect(remaining).toEqual([]);
    expect(loadCustomFormations(storage)).toEqual([]);
  });

  it('상한(8개)을 넘으면 가장 오래된 것부터 제거된다', () => {
    const storage = mockStorage();
    let latest = loadCustomFormations(storage);
    for (let i = 0; i < 9; i++) {
      latest = saveCustomFormation(`포메이션${i}`, VALID_11, storage);
    }
    expect(latest.length).toBe(8);
    expect(latest[0]!.label).toBe('포메이션1'); // 포메이션0은 밀려남
    expect(latest[7]!.label).toBe('포메이션8');
  });
});
