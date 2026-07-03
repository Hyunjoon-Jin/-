import { describe, it, expect } from 'vitest';
import {
  matchOutcomeKind, mediaToneOptions, shouldTriggerMediaEvent, applyMediaTone,
  MEDIA_TONE_STYLE, classifyPersona, type MediaTone,
} from '../src/media.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';

describe('media: 감독 인터뷰', () => {
  it('경기 결과를 승/무/패로 정확히 분류한다', () => {
    expect(matchOutcomeKind(2, 1)).toBe('win');
    expect(matchOutcomeKind(1, 2)).toBe('loss');
    expect(matchOutcomeKind(1, 1)).toBe('draw');
  });

  it('반환된 배열을 변형해도 다음 호출에는 영향이 없다(공유 참조 아님)', () => {
    const first = mediaToneOptions('win');
    first.sort((a, b) => a.moraleDelta - b.moraleDelta); // 호출부가 정렬 등으로 변형
    first.pop();
    const second = mediaToneOptions('win');
    expect(second.length).toBeGreaterThanOrEqual(2);
    expect(second).not.toBe(first);
  });

  it('결과 유형별 답변 톤 선택지가 2개 이상 있고, trade-off가 존재한다', () => {
    for (const kind of ['win', 'draw', 'loss'] as const) {
      const opts = mediaToneOptions(kind);
      expect(opts.length).toBeGreaterThanOrEqual(2);
      // 모든 선택지가 동일한 방향이 아니라, 사기·신뢰도 사이에 최소한의 상충이 있다.
      const moraleVaries = new Set(opts.map((o) => o.moraleDelta)).size > 1;
      const confVaries = new Set(opts.map((o) => o.confidenceDelta)).size > 1;
      expect(moraleVaries || confVaries).toBe(true);
    }
  });

  it('트리거 확률은 여러 시드에 걸쳐 true/false가 모두 나온다', () => {
    const results = new Set<boolean>();
    for (let s = 0; s < 60; s++) results.add(shouldTriggerMediaEvent(new Rng(s)));
    expect(results.has(true)).toBe(true);
    expect(results.has(false)).toBe(true);
  });

  it('applyMediaTone은 스쿼드 전원 사기를 델타만큼 변화시키고 0~1로 clamp한다', () => {
    const club = generateClub(new Rng(7), 'c1', 'Test FC', 12);
    club.players.forEach((p) => { p.morale = 0.5; });
    applyMediaTone(club, { tone: 'confident', style: 'bold', moraleDelta: 0.08, confidenceDelta: 1 });
    club.players.forEach((p) => expect(p.morale).toBeCloseTo(0.58, 5));

    club.players.forEach((p) => { p.morale = 0.99; });
    applyMediaTone(club, { tone: 'confident', style: 'bold', moraleDelta: 0.08, confidenceDelta: 1 });
    club.players.forEach((p) => expect(p.morale).toBeLessThanOrEqual(1));
  });

  it('모든 톤 선택지에 성향(style)이 매겨져 있고, mediaToneOptions가 반환하는 값과 일치한다', () => {
    const allTones: MediaTone[] = [
      'confident', 'humble', 'accountable', 'blamePlayers', 'blameRef', 'satisfied', 'frustrated',
    ];
    for (const tone of allTones) {
      expect(['bold', 'humble']).toContain(MEDIA_TONE_STYLE[tone]);
    }
    for (const kind of ['win', 'draw', 'loss'] as const) {
      for (const opt of mediaToneOptions(kind)) {
        expect(opt.style).toBe(MEDIA_TONE_STYLE[opt.tone]);
      }
    }
  });

  it('classifyPersona: 표본이 적거나 팽팽하면 neutral, 한쪽이 확실히 우세하면 그 성향', () => {
    expect(classifyPersona(0, 0)).toBe('neutral');
    expect(classifyPersona(2, 0)).toBe('neutral'); // 표본 부족
    expect(classifyPersona(2, 2)).toBe('neutral'); // 팽팽
    expect(classifyPersona(4, 1)).toBe('bold');
    expect(classifyPersona(1, 4)).toBe('humble');
  });
});
