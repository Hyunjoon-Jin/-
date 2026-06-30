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
| `simulateMatch.ts` | 틱 기반 경기 시뮬 (점유→전진→슈팅→결과) |
| `league.ts` | 더블 라운드로빈 시즌 시뮬 + 순위표 |
| `generate.ts` | 가상 선수·구단 절차적 생성 |
| `simSeason.ts` | 헤드리스 밸런싱 검증 하니스 |

## 실행

```bash
# 경기 1건 데모 (텍스트 중계)
npm run demo --workspace @soccer-tycoon/engine

# 시즌 시뮬 + 밸런스 지표 출력
npm run sim-season --workspace @soccer-tycoon/engine

# 테스트 (재현성 + 분포 가드레일)
npm test --workspace @soccer-tycoon/engine

# 타입 체크
npm run typecheck --workspace @soccer-tycoon/engine
```

## 현재 밸런스 지표 (16팀 시즌 기준)

- 경기당 평균 득점: ~2.7 (목표 2.5~3.0)
- 홈/무/원정 승률: ~44% / 21% / 35%
- 전력↔승점 순위상관: ~0.94 (강팀이 상위)
