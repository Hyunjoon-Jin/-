# @soccer-tycoon/desktop

Electron 데스크톱 셸. 렌더러(`@soccer-tycoon/app` 빌드)를 띄우고,
**SQLite 기반 세이브 저장소**를 메인 프로세스에서 제공한다.

## 구성

| 파일 | 역할 |
|---|---|
| `src/main.ts` | Electron 메인. BrowserWindow 로드 + 세이브 IPC 등록 |
| `src/preload.ts` | `window.saveAPI` 노출(contextBridge, 동기 IPC) |
| `src/sqliteStore.ts` | SQLite 저장소 — Node 내장 `node:sqlite`(네이티브 빌드 불필요) |

## 저장 아키텍처

```
렌더러(app)                         메인(desktop)
ElectronSaveStore                   SqliteSaveStore (node:sqlite)
  serialize(GameState) → JSON  ──IPC──▶  saves 테이블 (id, json, meta)
  deserialize(JSON) ← GameState ◀─IPC──  SELECT json
```

- 렌더러의 `createSaveStore()`가 환경을 감지: `window.saveAPI`가 있으면
  `ElectronSaveStore`(SQLite), 없으면 `WebSaveStore`(localStorage).
- 직렬화 포맷은 동일 → 동일 `SaveStore` 인터페이스. 앱 코드는 어느 쪽이든 동일.
- DB 위치: `app.getPath('userData')/saves.db`.

## 실행

```bash
# 렌더러를 먼저 빌드
npm run build --workspace @soccer-tycoon/app

# 메인 컴파일 + Electron 실행 (데스크톱 환경 필요)
npm run start --workspace @soccer-tycoon/desktop

# 메인 타입체크 / SQLite 저장소 테스트(node:test)
npm run typecheck --workspace @soccer-tycoon/desktop
npm run test --workspace @soccer-tycoon/desktop
```

개발 모드로 띄우려면 Vite dev 서버를 켜고 `VITE_DEV_SERVER_URL`을 지정한다:

```bash
npm run dev --workspace @soccer-tycoon/app   # localhost:5173
VITE_DEV_SERVER_URL=http://localhost:5173 npm run start --workspace @soccer-tycoon/desktop
```

## 참고

- `node:sqlite`는 Node 22 내장(실험적) 모듈이라 better-sqlite3 같은 네이티브
  재빌드가 필요 없다. 저장소 로직은 `node:test`로 검증된다.
- 설치형 패키징(electron-builder 등)은 대상 OS 데스크톱 환경에서 수행한다(후속).
