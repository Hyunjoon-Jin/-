# @soccer-tycoon/app

축구 구단주 게임 데스크톱 UI. **Vite + React + TypeScript**로 작성되며,
`@soccer-tycoon/engine`을 그대로 소비한다. (Electron 패키징 시 이 앱이 렌더러가 된다.)

## 화면

| 화면 | 내용 |
|---|---|
| 시작 | 이어하기(저장 슬롯) + 새 게임(12개 구단 중 선택) |
| 대시보드 | 평판·자금·이적예산·주급총액·스쿼드 요약 + 지난 시즌 성적/수지 |
| 스쿼드 | 선수 목록 (나이·CA·잠재력·계약·가치·주급, 정렬 가능) |
| 리그 | 시즌 최종 순위표 (내 구단 하이라이트) |
| 이적 | 지난 시즌 이적 시장 내역 (내 구단 관련 강조) |

상단 **"시즌 진행"** 버튼이 엔진의 `advanceSeason`을 호출 →
이적 → 경기 → 정산 → 성장·노화가 한 번에 진행되고 화면이 갱신된다.

## 실행

```bash
npm run dev --workspace @soccer-tycoon/app        # 개발 서버 (localhost:5173)
npm run build --workspace @soccer-tycoon/app      # 프로덕션 번들
npm run typecheck --workspace @soccer-tycoon/app  # 타입 체크
```

## 구조

- `game.ts` — UI↔엔진 어댑터. 엔진이 객체를 직접 변경하므로 advance 후 새 GameState 래퍼 반환.
- `persistence.ts` — 세이브 직렬화(버전드). 엔진의 Map 필드 ↔ JSON 변환.
- `storage.ts` — `SaveStore` 인터페이스 + `WebSaveStore`(localStorage). SQLite 구현 드롭인 가능.
- `App.tsx` — 셸 + 탭 + "시즌 진행" + 시즌마다 자동 저장.
- `components/` — StartScreen / Dashboard / Squad / LeagueTable / Transfers.

## 저장 (Persistence)

- `serialize/deserialize`가 GameState ↔ 버전드 JSON을 변환한다.
  (`SeasonSummary.finance`는 `Map`이라 객체로 직렬화 후 로드 시 `Map` 복원.)
- `WebSaveStore`가 슬롯 단위로 localStorage에 저장. **시즌 진행마다 자동 저장**.
- 시작 화면의 "이어하기"에서 불러오기/삭제.
- **SQLite는 Electron 메인 프로세스용 구현**(브라우저 렌더러에선 직접 불가).
  포맷이 동일하므로 같은 `SaveStore` 인터페이스로 교체된다.

## 다음 단계

- Electron 셸 + SQLite `SaveStore` 구현.
- 경기 단위 진행(시즌 일괄 → 경기별) + 전술 편집 화면.
