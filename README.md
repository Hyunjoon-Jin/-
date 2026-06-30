# 축구 구단주 게임 (Soccer Tycoon)

축구 구단의 구단주가 되어 **영입·육성 / 경영 / 전술 / 장기 성장**을 모두 다루는
하드코어 시뮬레이션 게임 (PC 데스크톱, 싱글플레이).

## 현재 상태

플레이 가능한 프로토타입 단계. 헤드리스 엔진(경기·경영·이적·성장) 위에
React 데스크톱 UI가 올라가, 구단을 골라 여러 시즌을 진행할 수 있습니다.

## 문서

- [기획서 (docs/design.md)](docs/design.md) — 핵심 의사결정, 도메인 모델, MVP 범위, 기술 스택.
- [경기 엔진 & 능력치 설계 (docs/engine.md)](docs/engine.md) — 능력치 36종, 포지션, 팀 강도 산출, 틱 기반 경기 시뮬 알고리즘.
- [경영·이적 시스템 설계 (docs/economy.md)](docs/economy.md) — 선수 가치·연봉 공식, 구단 재정·시즌 정산, 이적 시장 AI.

## 빠른 실행

```bash
npm install

# 데스크톱 UI (구단 선택 → 시즌 진행 → 스쿼드·리그·이적 화면)
npm run dev --workspace @soccer-tycoon/app

# 엔진 헤드리스 데모/테스트
npm run demo                # 경기 1건 텍스트 중계
npm run test                # 엔진 테스트 (재현성 + 분포 가드레일)
npm run sim-season --workspace @soccer-tycoon/engine     # 시즌 밸런스 지표
npm run economy-demo --workspace @soccer-tycoon/engine   # 가치평가·이적·재정
npm run franchise-demo --workspace @soccer-tycoon/engine # 멀티시즌 성장·노화
```

패키지 상세: [`packages/engine/README.md`](packages/engine/README.md) · [`packages/app/README.md`](packages/app/README.md).

## 패키지

| 패키지 | 역할 |
|---|---|
| `@soccer-tycoon/engine` | 헤드리스 시뮬레이션 엔진 (경기·경영·이적·성장). 28 테스트. |
| `@soccer-tycoon/app` | Vite + React 데스크톱 UI (Electron 렌더러). |

## 계획된 기술 스택

TypeScript 모노레포 — 헤드리스 시뮬 엔진 + Electron/React UI + SQLite 세이브.
자세한 내용은 기획서를 참고하세요.
