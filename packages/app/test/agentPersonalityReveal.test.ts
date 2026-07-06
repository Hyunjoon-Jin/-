import { describe, it, expect } from 'vitest';
import { isAgentPersonalityRevealed, AGENT_PERSONALITY_REVEAL_SCOUTING } from '../src/game.js';

describe('고도화 항목2: 에이전트 개성 스카우팅 연동', () => {
  it('스카우팅 레벨이 기준 미만이고 파견 정찰도 안 했으면 공개되지 않는다', () => {
    expect(isAgentPersonalityRevealed(AGENT_PERSONALITY_REVEAL_SCOUTING - 1)).toBe(false);
    expect(isAgentPersonalityRevealed(0)).toBe(false);
  });

  it('스카우팅 레벨이 기준 이상이면 공개된다', () => {
    expect(isAgentPersonalityRevealed(AGENT_PERSONALITY_REVEAL_SCOUTING)).toBe(true);
    expect(isAgentPersonalityRevealed(20)).toBe(true);
  });

  it('스카우팅 레벨이 낮아도 파견 정찰(scouted)을 마쳤으면 공개된다', () => {
    expect(isAgentPersonalityRevealed(0, true)).toBe(true);
  });
});
