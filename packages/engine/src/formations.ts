/**
 * 포메이션 프리셋 — 슬롯 포지션 배열의 단일 소스.
 * 예전엔 앱(tactics.ts)과 엔진(generate.ts의 FORMATION_433)에 각자 하드코딩되어
 * 있어 두 곳이 어긋날 위험이 있었다. 이제 엔진이 유일한 소스이고, 앱은 이를 가져다 쓴다.
 */
import type { Position } from './types.js';

export const FORMATIONS: Record<string, Position[]> = {
  '4-3-3': ['GK', 'DL', 'DC', 'DC', 'DR', 'MC', 'MC', 'MC', 'AML', 'ST', 'AMR'],
  '4-4-2': ['GK', 'DL', 'DC', 'DC', 'DR', 'ML', 'MC', 'MC', 'MR', 'ST', 'ST'],
  '4-2-3-1': ['GK', 'DL', 'DC', 'DC', 'DR', 'DM', 'DM', 'AML', 'AMC', 'AMR', 'ST'],
  '3-5-2': ['GK', 'DC', 'DC', 'DC', 'WBL', 'MC', 'MC', 'MC', 'WBR', 'ST', 'ST'],
};

export const FORMATION_NAMES = Object.keys(FORMATIONS);
