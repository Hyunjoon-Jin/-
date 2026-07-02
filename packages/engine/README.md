# @soccer-tycoon/engine

헤드리스 축구 시뮬레이션 엔진. UI 의존성이 없으며, 시드 고정 시 완전히 재현된다.
설계 문서: [`docs/engine.md`](../../docs/engine.md).

## 구성

| 파일 | 역할 |
|---|---|
| `types.ts` | 능력치 36종 / 포지션 / 선수·구단·전술·경기 결과 타입 |
| `rng.ts` | 시드 기반 결정론 난수 (mulberry32) |
| `roleWeights.ts` | 파생 능력치 가중치 표 (밸런싱 데이터) |
| `derived.ts` | 36능력치 → 역할별 파생값 + 컨디션·사기·숙련도 보정 |
| `teamStrength.ts` | 라인업 → 팀 강도 7지표 집계 |
| `tuning.ts` | 밸런싱 상수 (xG·로지스틱 계수 등) |
| `simulateMatch.ts` | 틱 기반 경기 시뮬 (컨텍스트+스텝+마무리 분리, 일괄/라이브 공유). 부상 판정(킥오프 시점 확정)도 여기서 생성 |
| `liveMatch.ts` | 재개 가능한 라이브 경기 (분 단위 관전 + 하프타임 전술 교체 + 부상 스케줄 조회) |
| `schedule.ts` | 라운드 로빈 일정 생성 (서클 메서드) |
| `season.ts` | 상태 기반 시즌(경기 단위 진행 + 순위표 집계) |
| `league.ts` | 헤드리스 일괄 시즌 시뮬 (season.ts 래퍼) |
| `generate.ts` | 가상 선수·구단 절차적 생성 |
| `simSeason.ts` | 헤드리스 밸런싱 검증 하니스 (단일 시즌) |
| `balance.ts` | 멀티시즌 밸런스 리포트 (전력↔순위·재정·연령 등) |
| `money.ts` | 화폐 단위(만원) + 억/만원 표시 |
| `valuation.ts` | 선수 시장 가치 · 주급 산정 |
| `finance.ts` | 구단 재정 · 시즌 정산 · 리그 상금 |
| `transfer.ts` | 이적 시장 AI 시뮬 (약점 보강) |
| `transferActions.ts` | 사용자 주도 이적 (영입/판매/방출) |
| `staffActions.ts` | 스태프 업그레이드 (코칭·의료·스카우팅·유스) |
| `cup.ts` | 컵대회 (단판 녹아웃 토너먼트, 승부차기·부전승) |
| `matchEffects.ts` | 경기 후 상태 변화 (피로·사기·징계 + simulateMatch가 판정한 부상 반영) |
| `injury.ts` | 부상 등급·부위 세분화 (경미/중등도/중상, 의료 연동 생성 로직) |
| `stats.ts` | 시즌 선수 통계 집계 + 어워드(득점왕·시즌 베스트) |
| `form.ts` | 최근 폼(승·무·패) 집계 — 경기 프리뷰·스카우팅용 |
| `progression.ts` | 시즌 경계 성장·노화 (잠재력 수렴 / 노장 하락, 훈련 포커스 반영) |
| `training.ts` | 훈련 포커스 → 성장 강조 능력 매핑 |
| `traits.ts` | 선수 고유 특성 8종 (부여 규칙 + 파생·부상·성장·카드·사기 보정) |
| `franchise.ts` | 멀티시즌 루프 (이적→경기→정산→성장→은퇴·유스→국대 차출). 은퇴 시 통산 기록 스냅샷(RetiredLegend), 통산 마일스톤 돌파(CareerMilestone) 반환 |
| `international.ts` | 국가대표 차출 (국적별 상위 선수 A매치 캡·피로·부상 리스크) |
| `board.ts` | 이사회 신뢰도 (시즌 성적→신뢰도 변동·경질 판정) |
| `demands.ts` | 이사회 특별 요구 (임금 감축·컵 우승·득점왕 생성·평가·신뢰도 연동) |
| `scouting.ts` | 스카우팅 리포트 (전체·잠재력 등급, 나이 프로필, 강점·약점 분류) |
| `media.ts` | 감독 인터뷰 (경기 결과 분류 → 답변 톤별 사기·이사회 신뢰도 트레이드오프, 누적 톤 성향 → 감독 이미지 판정) |
| `economyDemo.ts` | 가치평가 + 이적 창 + 재정 정산 데모 |
| `franchiseDemo.ts` | 멀티시즌 + 유망주 성장 곡선 추적 데모 |

## 실행

```bash
# 경기 1건 데모 (텍스트 중계)
npm run demo --workspace @soccer-tycoon/engine

# 시즌 시뮬 + 밸런스 지표 출력
npm run sim-season --workspace @soccer-tycoon/engine

# 경영·이적 데모 (가치평가 + 이적 창 + 재정 정산)
npm run economy-demo --workspace @soccer-tycoon/engine

# 멀티시즌 데모 (성장·노화·은퇴 + 유망주 성장 곡선)
npm run franchise-demo --workspace @soccer-tycoon/engine

# 테스트 (재현성 + 분포 가드레일)
npm test --workspace @soccer-tycoon/engine

# 타입 체크
npm run typecheck --workspace @soccer-tycoon/engine
```

## 현재 밸런스 지표 (16팀 시즌 기준)

- 경기당 평균 득점: ~2.7 (목표 2.5~3.0)
- 홈/무/원정 승률: ~44% / 21% / 35%
- 전력↔승점 순위상관: ~0.94 (강팀이 상위)
