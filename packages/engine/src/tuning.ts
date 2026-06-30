/**
 * 밸런싱 상수 (engine.md 4.3, 7장).
 * 헤드리스 시즌 시뮬(simSeason)의 분포를 보며 이 값들만 조정한다.
 */
export const TUNING = {
  /** 경기 길이(틱). 1틱 = 1분. */
  matchLength: 90,

  /** 홈 어드밴티지: 홈팀 공격/창출에 곱하는 배율. */
  homeAdvantage: 1.06,

  /** pAdvance(전진 성공) 로지스틱. */
  advanceBase: 0.30,        // 능력 동일 시 기준 전진 확률
  advanceK: 0.030,          // (creation - defense) 민감도

  /** pShot(슈팅 발생) 로지스틱. */
  shotBase: 0.55,           // 전진 성공 후 슈팅으로 이어질 기준 확률
  shotK: 0.025,             // (attack - defense) 민감도

  /** 기회 유형별 기본 득점 기대치(xG 베이스). */
  baseXg: { open: 0.16, cross: 0.14, setpiece: 0.11 } as const,

  /** 득점 확률 보정 민감도. */
  finishK: 0.010,           // 공격력 → 득점 배율
  gkK: 0.009,               // GK → 실점 억제 배율

  /** 슛이 골이 아닐 때 결과 분포 (선방/빗나감/막힘). */
  nonGoalSplit: { save: 0.45, offTarget: 0.40, blocked: 0.15 } as const,
} as const;
