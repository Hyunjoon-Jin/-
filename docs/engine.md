# 경기 엔진 & 능력치 체계 설계

> 작성일: 2026-06-30
> 상태: 설계 v0.1 (구현 전 사양)
> 상위 문서: [기획서 (design.md)](design.md)

이 문서는 하드코어 시뮬레이션의 심장인 **(1) 선수 능력치 체계**와
**(2) 경기 시뮬레이션 알고리즘**을 구체적으로 정의한다.
모든 수치는 구현·밸런싱 과정에서 조정될 수 있는 **초기 기준값**이다.

---

## 1. 능력치 체계

### 1.1 설계 원칙

- 모든 능력치는 **1~20** 정수 척도 (FM 관례). 평균적인 1부 리그 주전 ≈ 10~13.
- 카테고리: **기술(Technical) / 정신(Mental) / 신체(Physical) / 골키핑(Goalkeeping)**.
- 필드 선수는 골키핑 카테고리를 사실상 사용하지 않고, GK는 기술 일부를 덜 쓴다.
- 잠재력은 능력치와 별개 값으로 관리한다(1.4 참고).

### 1.2 능력치 목록 (총 36개)

#### 기술 (Technical) — 11
| 키 | 한글 | 의미 |
|---|---|---|
| `finishing` | 결정력 | 슈팅을 골로 연결 |
| `shooting` | 슈팅력 | 중거리/파워 슈팅 |
| `passing` | 패스 | 패스 정확도 |
| `crossing` | 크로스 | 측면 크로스 정확도 |
| `dribbling` | 드리블 | 공 운반·돌파 |
| `firstTouch` | 퍼스트터치 | 트래핑/볼 컨트롤 |
| `technique` | 기술 | 까다로운 볼 처리 전반 |
| `tackling` | 태클 | 볼 탈취 |
| `marking` | 마크 | 상대 밀착 수비 |
| `heading` | 헤딩 | 공중볼 경합·헤더 |
| `setPiece` | 세트피스 | 프리킥/코너/페널티 |

#### 정신 (Mental) — 12
| 키 | 한글 | 의미 |
|---|---|---|
| `vision` | 시야 | 결정적 패스 선택 |
| `composure` | 침착성 | 압박 속 실수 억제 |
| `decisions` | 판단력 | 상황별 최적 선택 |
| `anticipation` | 예측 | 다음 플레이 예측 |
| `offTheBall` | 오프더볼 | 공 없을 때 움직임 |
| `positioning` | 위치선정 | 수비 위치 잡기 |
| `concentration` | 집중력 | 경기 내내 실수 억제 |
| `teamwork` | 팀워크 | 전술 수행 충실도 |
| `workRate` | 활동량 | 경기 내 에너지 투입 |
| `aggression` | 적극성 | 경합 적극성 |
| `bravery` | 대담성 | 위험 감수 |
| `leadership` | 리더십 | 사기/주장 효과 |

#### 신체 (Physical) — 8
| 키 | 한글 | 의미 |
|---|---|---|
| `pace` | 속도 | 최고 주력 |
| `acceleration` | 가속력 | 초반 가속 |
| `stamina` | 스태미너 | 체력 지속 |
| `strength` | 몸싸움 | 피지컬 경합 |
| `agility` | 민첩성 | 방향 전환 |
| `balance` | 밸런스 | 균형 유지 |
| `jumping` | 점프 | 점프 도달 높이 |
| `naturalFitness` | 자연회복 | 피로 회복·노화 저항 |

#### 골키핑 (Goalkeeping) — 5
| 키 | 한글 | 의미 |
|---|---|---|
| `reflexes` | 반응속도 | 슛 선방 |
| `handling` | 핸들링 | 캐칭/펀칭 안정성 |
| `oneOnOne` | 일대일 | 1:1 대응 |
| `aerialReach` | 공중장악 | 크로스 처리 |
| `goalkicks` | 골킥/배급 | GK 빌드업 |

> 합계 11 + 12 + 8 + 5 = **36개**.
> MVP에서는 일부를 묶어 축소판으로 시작할 수 있으나, **키 구조는 유지**한다.

### 1.3 파생 능력치 (Derived)

경기 엔진은 위 36개를 직접 쓰지 않고, **역할별 가중 합산**으로 만든 파생값을 쓴다.
이렇게 하면 "포지션마다 중요한 능력치가 다르다"가 자연스럽게 표현된다.

예시 파생값(0~100으로 정규화):
- `attackRating` = f(finishing, shooting, offTheBall, composure, technique, ...)
- `chanceCreation` = f(vision, passing, crossing, dribbling, decisions, ...)
- `buildUp` = f(passing, firstTouch, composure, vision, ...)
- `defenseRating` = f(tackling, marking, positioning, anticipation, strength, ...)
- `physicalRating` = f(pace, acceleration, stamina, strength, ...)
- `aerialRating` = f(heading, jumping, strength, bravery, ...)
- `gkRating` = f(reflexes, handling, oneOnOne, positioning, concentration, ...)

가중치 표는 `packages/engine`의 `roleWeights.ts`로 분리해 데이터로 관리한다(밸런싱 용이).

### 1.4 잠재력 & 성장

- **CA(Current Ability)**: 현재 종합 능력. 36개 능력치의 가중 합 기반 단일 지표(0~200).
- **PA(Potential Ability)**: 도달 가능한 최대 CA. **범위형**으로 생성(예: 140~170)하여
  플레이 중 환경(훈련 시설·코치·출전시간)에 따라 실현 정도가 달라진다.
- **성장 곡선**: 나이 함수.
  - ~21세: 빠른 성장 가능(PA 여유분이 능력치로 전환).
  - 22~28세: 전성기, 완만한 성장/정점.
  - 29세~: `naturalFitness`에 따라 신체 능력부터 점진 하락.
- 성장/하락은 **시즌 경계**에서 일괄 적용한다.

---

## 2. 포지션 모델

### 2.1 포지션 정의

```
GK
DL DC DR            (수비: 좌/중/우)
WBL WBR             (윙백)
DM                  (수비형 미드필더)
ML MC MR            (미드필더: 좌/중/우)
AML AMC AMR         (공격형 미드필더)
ST                  (스트라이커)
```

### 2.2 포지션 숙련도

각 선수는 포지션별 **숙련도**(자연스러움 0~1)를 가진다.
주 포지션 = 1.0, 부 포지션 = 0.5~0.8, 비숙련 포지션 = 0.2 이하.
숙련도가 낮은 포지션에서 뛰면 파생 능력치에 페널티가 붙는다.

### 2.3 포메이션

포메이션 = 11개 포지션 슬롯의 집합 (예: 4-4-2, 4-3-3, 4-2-3-1).
선발 라인업은 (선수 → 슬롯) 매핑이며, 슬롯 포지션과 선수 주 포지션의 거리로
숙련도 페널티를 계산한다.

---

## 3. 팀 강도 산출 (경기 입력)

경기 시뮬은 개별 선수가 아니라 **팀 단위 파생 지표**를 입력으로 받는다.
라인업이 정해지면 다음을 계산한다.

1. 각 선수의 파생 능력치를 **숙련도·컨디션·사기**로 보정.
   - `effective = base × positionFamiliarity × conditionFactor × moraleFactor`
   - `conditionFactor`: 피로/부상 반영(0.6~1.0).
   - `moraleFactor`: 사기 반영(0.9~1.05).
2. 라인(수비/미드/공격)별로 해당 선수들의 파생값을 집계.
3. 전술 지시(압박·템포·라인 높이 등)로 라인별 가중치를 조정.
4. 최종 팀 지표 산출:
   - `teamAttack`, `teamCreation`, `teamMidfield`, `teamDefense`,
     `teamPhysical`, `teamAerial`, `teamGK`.

이 7개 지표가 4장 시뮬의 핵심 입력이다.

---

## 4. 경기 시뮬레이션 알고리즘

### 4.1 개요

- 90분 + 인저리타임을 **틱(tick)** 으로 분할. 기준: **1틱 = 1분**(총 ~90~95틱).
- 각 틱마다 (a) 점유권 결정 → (b) 전진 시도 → (c) 슈팅/세트피스 →
  (d) 슛 결과(골/선방/빗나감) 순으로 확률 판정.
- 모든 난수는 **시드 기반 PRNG**(예: mulberry32)로 생성 → 동일 시드 = 동일 결과(재현성·디버깅).
- 출력: 스코어, 분 단위 이벤트 로그, 선수별 스탯/평점.

### 4.2 틱 처리 흐름

```
for tick in 1..matchLength:
    # (a) 점유권: 미드필드 우위로 확률 결정
    pPossHome = teamMidfieldHome / (teamMidfieldHome + teamMidfieldAway)
    possessor = weightedPick(pPossHome)

    # (b) 전진 시도: 공격팀 창출력 vs 수비팀 수비력
    pAdvance = logistic(k1 * (creation(att) - defense(def)) + tempoBias)
    if not roll(pAdvance): continue        # 빌드업 끊김

    # (c) 기회 유형 결정: 오픈플레이 / 측면크로스 / 세트피스
    chanceType = pickChanceType(att tactics, randomness)

    # (d) 슛 여부: 기회의 질
    pShot = logistic(k2 * (attackQuality(att, chanceType) - defenseBlock(def)))
    if not roll(pShot): continue

    # (e) 슛 결과: 마무리 vs 골키핑
    xg = baseXg(chanceType) * finishingFactor(att) / gkFactor(def)
    outcome = resolveShot(xg)              # GOAL / SAVE / OFF_TARGET / BLOCKED
    recordEvent(tick, possessor, chanceType, outcome)
```

### 4.3 핵심 변환식

- **로지스틱 함수**로 "능력차 → 확률"을 매끄럽게 매핑:
  `logistic(x) = 1 / (1 + e^(-x))`.
  능력차가 0이면 0.5, 차이가 커질수록 0/1로 수렴(상한·하한은 클램프).
- **계수 k1, k2** 등은 밸런싱 상수. `tuning.ts`로 분리.
- **랜덤성**: 모든 판정에 약한 노이즈를 더해 "약팀이 강팀을 잡는" 이변을 허용.

### 4.4 시간/체력 반영

- `stamina`/`naturalFitness`에 따라 후반으로 갈수록 `conditionFactor` 하락 →
  파생 능력치 감소 → 후반 변수.
- 교체(추후)로 체력 회복 슬롯 운영.

### 4.5 선수 평점 (Player Rating)

- 기본 6.0에서 시작, 이벤트 기여로 가감(골/어시/선방/실책/카드 등).
- 포지션별 기대 역할 대비 성과로 보정. 6.5 이상 = 호평, 8.0+ = MOTM 후보.

### 4.6 출력 데이터 구조 (개념)

```ts
interface MatchResult {
  homeClubId: string; awayClubId: string;
  score: [number, number];
  events: MatchEvent[];           // { minute, type, clubId, playerId, detail }
  playerStats: PlayerMatchStat[]; // { playerId, rating, shots, passes, ... }
  possession: [number, number];   // %
  seed: number;                   // 재현용
}
```

---

## 5. 검증 전략 (밸런싱)

엔진은 **헤드리스 실행**이 가능해야 하며, 다음으로 밸런스를 검증한다.

- **단일 경기 재현성**: 같은 시드 → 항상 같은 결과 (단위 테스트).
- **분포 검증**: 한 시즌(또는 N시즌)을 자동 시뮬 후 통계가 현실적인지 확인.
  - 경기당 평균 득점(목표 ≈ 2.5~3.0).
  - 홈 어드밴티지(승률에 반영).
  - 강팀의 시즌 승점 우위(능력↔성적 상관).
  - 이변 발생률(너무 결정론적이지도, 너무 무작위적이지도 않게).
- 이 지표들을 측정하는 `simSeason()` 헤드리스 스크립트를 엔진 패키지에 둔다.

---

## 6. 구현 순서 (엔진 패키지)

1. 능력치/포지션 **타입 정의** (`types.ts`).
2. 파생 능력치 + 역할 가중치 (`roleWeights.ts`, `derived.ts`).
3. 시드 PRNG (`rng.ts`).
4. 팀 강도 산출 (`teamStrength.ts`).
5. 틱 기반 경기 시뮬 (`simulateMatch.ts`).
6. 평점 계산 (`rating.ts`).
7. 헤드리스 시즌 시뮬 + 분포 측정 (`simSeason.ts`).
8. Vitest로 재현성·분포 테스트.

---

## 7. 열린 질문 (이 문서에서 추적)

1. 파생 능력치 **가중치 표**의 초기값(역할별).
2. 로지스틱 계수 k1, k2 및 baseXg 등 **튜닝 상수** 초기값.
3. 틱 단위를 1분 고정으로 둘지, 이벤트 기반 가변으로 둘지.
4. 컨디션/사기 보정 계수의 범위.
5. CA↔36개 능력치 환산 가중치.
