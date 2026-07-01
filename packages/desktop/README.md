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

## 설치형 패키징 (electron-builder)

```bash
# 렌더러 조립(app/dist → renderer) + 메인 컴파일 + 설치 파일 생성
npm run dist --workspace @soccer-tycoon/desktop
# → release/ 에 AppImage(Linux) / nsis(Windows) / dmg(macOS) 생성
```

구성:
- `scripts/prepare-renderer.mjs` — `packages/app/dist`를 `packages/desktop/renderer`로 복사
  (모노레포 sibling 참조 회피). 메인은 `../renderer/index.html`을 로드(없으면 app/dist 폴백).
- `package.json`의 `build` 필드 — appId, 타깃(AppImage/nsis/dmg), 포함 파일(dist-main·renderer).

> **주의**: 실제 설치 파일 생성은 GUI/Electron 런타임이 있는 **대상 OS 데스크톱 환경**에서
> 수행한다. 헤드리스 CI에서는 렌더러 조립·메인 컴파일·SQLite 저장소 테스트까지 검증되며,
> 설치 파일 산출물 자체는 데스크톱 빌드 단계에서 생성된다.

## 참고

- `node:sqlite`는 Node 22 내장(실험적) 모듈이라 better-sqlite3 같은 네이티브
  재빌드가 필요 없다. 저장소 로직은 `node:test`로 검증된다.
