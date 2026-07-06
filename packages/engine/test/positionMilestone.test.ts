import { describe, it, expect } from 'vitest';
import { runOffseason } from '../src/franchise.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';

describe('고도화 Item13: 포지션 전환 마일스톤', () => {
  it('전환 훈련 지정 포지션의 숙련도가 임계값(30/60/90/100%)을 이번 시즌에 처음 넘으면 기록된다', () => {
    const rng = new Rng(1);
    const club = generateClub(rng, 'c', 'C', 12);
    const p = club.players.find((pl) => pl.position !== 'GK')!;
    const target = p.position === 'DC' ? 'ST' : 'DC';
    p.trainingPosition = target;
    p.familiarity[target] = 0.28; // 30% 문턱 바로 아래

    const result = runOffseason([club], new Rng(2));
    const hit = result.milestones.find((m) => (
      m.playerId === p.id && m.kind === 'positionMastery' && m.position === target
    ));
    expect(hit).toBeDefined();
    expect(hit!.value).toBe(30);
  });

  it('전환 훈련을 지정하지 않은 선수는 포지션 마일스톤이 기록되지 않는다', () => {
    const rng = new Rng(3);
    const club = generateClub(rng, 'c', 'C', 12);
    for (const p of club.players) p.trainingPosition = undefined;
    const result = runOffseason([club], new Rng(4));
    expect(result.milestones.some((m) => m.kind === 'positionMastery')).toBe(false);
  });

  it('이미 넘은 임계값은 다시 기록되지 않는다', () => {
    const rng = new Rng(5);
    const club = generateClub(rng, 'c', 'C', 12);
    const p = club.players.find((pl) => pl.position !== 'GK')!;
    const target = p.position === 'DC' ? 'ST' : 'DC';
    p.trainingPosition = target;
    p.familiarity[target] = 0.95; // 이미 90% 돌파, 100%만 남음
    const result = runOffseason([club], new Rng(6));
    expect(result.milestones.some((m) => (
      m.playerId === p.id && m.kind === 'positionMastery' && m.value === 30
    ))).toBe(false);
    expect(result.milestones.some((m) => (
      m.playerId === p.id && m.kind === 'positionMastery' && m.value === 60
    ))).toBe(false);
  });

  it('숙련도가 점근적으로 100%에 근접하면 100% 마일스톤도 기록된다', () => {
    const rng = new Rng(7);
    const club = generateClub(rng, 'c', 'C', 12);
    club.staff.coaching = 20; // 최대 코칭으로 수렴 속도를 높여 테스트를 안정화
    const p = club.players.find((pl) => pl.position !== 'GK')!;
    const target = p.position === 'DC' ? 'ST' : 'DC';
    p.trainingPosition = target;
    p.attributes.decisions = 20;
    p.attributes.naturalFitness = 20; // 은퇴 위험 최소화(반복 시즌 동안 나이가 든다)
    p.age = 18;
    p.familiarity[target] = 0.98; // 100% 문턱(반올림 기준 99.5% 이상) 바로 아래
    // 점근적 수렴이라 한 시즌만으론 도달 못 할 수 있어 여러 시즌 반복한다
    // (최대 코칭·판단력 기준 약 15시즌이면 충분 — 여유를 두고 30시즌까지 시도).
    let hit100 = false;
    for (let i = 0; i < 30 && !hit100; i++) {
      const result = runOffseason([club], new Rng(8 + i));
      if (result.milestones.some((m) => (
        m.playerId === p.id && m.kind === 'positionMastery' && m.value === 100
      ))) hit100 = true;
    }
    expect(hit100).toBe(true);
  });
});
