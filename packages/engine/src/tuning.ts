/**
 * 밸런싱 상수 (engine.md 4.3, 7장).
 * 헤드리스 시즌 시뮬(simSeason)의 분포를 보며 이 값들만 조정한다.
 */
export const TUNING = {
  /** 경기 길이(틱). 1틱 = 1분. */
  matchLength: 90,

  /** 홈 어드밴티지: 홈팀 공격/창출에 곱하는 배율. */
  homeAdvantage: 1.06,

  /** 능력차가 확률에 미치는 최대 진폭(±). 높을수록 전력이 결정적. */
  strengthSwing: 0.5,

  /** pAdvance(전진 성공) 로지스틱. */
  advanceBase: 0.30,        // 능력 동일 시 기준 전진 확률
  advanceK: 0.030,          // (creation - defense) 민감도

  /** pShot(슈팅 발생) 로지스틱. */
  shotBase: 0.55,           // 전진 성공 후 슈팅으로 이어질 기준 확률
  shotK: 0.025,             // (attack - defense) 민감도

  /** 기회 유형별 기본 득점 기대치(xG 베이스). */
  baseXg: { open: 0.135, cross: 0.115, setpiece: 0.09 } as const,

  /** 득점 확률 보정 민감도. */
  finishK: 0.010,           // 공격력 → 득점 배율
  gkK: 0.009,               // GK → 실점 억제 배율

  /** 슛이 골이 아닐 때 결과 분포 (선방/빗나감/막힘). */
  nonGoalSplit: { save: 0.45, offTarget: 0.40, blocked: 0.15 } as const,

  /** 부상 발생 기본 확률(선발 1명당 경기당). matchEffects.medicalFactor·특성으로 가감. */
  injuryTriggerChance: 0.008,

  /** 내 경기 후 미디어 인터뷰(감독 질의응답)가 열릴 확률. */
  mediaEventChance: 0.35,
} as const;
