/**
 * Electron 메인 프로세스.
 * 렌더러(packages/app 빌드)를 BrowserWindow로 로드하고,
 * SQLite 세이브 저장소를 IPC(sendSync)로 노출한다.
 */
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SqliteSaveStore, type SaveMeta } from './sqliteStore';

let store: SqliteSaveStore | null = null;

/** meta가 렌더러에서 넘어온 그대로 SQLite에 쓰이기 전 최소한의 형태 검증. */
function isValidSaveMeta(meta: unknown): meta is Omit<SaveMeta, 'id'> {
  if (!meta || typeof meta !== 'object') return false;
  const m = meta as Record<string, unknown>;
  return typeof m.clubName === 'string' && Number.isFinite(m.season) && typeof m.savedAt === 'string';
}

function registerSaveIpc(): void {
  ipcMain.on('save:list', (e) => {
    try {
      e.returnValue = store ? store.list() : [];
    } catch (err) {
      console.error('save:list 실패', err);
      e.returnValue = [];
    }
  });
  ipcMain.on('save:load', (e, id: string) => {
    try {
      e.returnValue = store && typeof id === 'string' ? store.load(id) : null;
    } catch (err) {
      console.error('save:load 실패', err);
      e.returnValue = null;
    }
  });
  ipcMain.on('save:save', (e, id: string, json: string, meta: Omit<SaveMeta, 'id'>) => {
    try {
      if (!store || typeof id !== 'string' || typeof json !== 'string' || !isValidSaveMeta(meta)) {
        e.returnValue = false;
        return;
      }
      store.save(id, json, meta);
      e.returnValue = true;
    } catch (err) {
      console.error('save:save 실패', err);
      e.returnValue = false;
    }
  });
  ipcMain.on('save:remove', (e, id: string) => {
    try {
      if (store && typeof id === 'string') store.remove(id);
      e.returnValue = true;
    } catch (err) {
      console.error('save:remove 실패', err);
      e.returnValue = false;
    }
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    backgroundColor: '#0f1420',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    // 패키징 시 조립된 렌더러(../renderer). 없으면 개발 편의상 app/dist로 폴백.
    const bundled = join(__dirname, '../renderer/index.html');
    const fallback = join(__dirname, '../../app/dist/index.html');
    win.loadFile(existsSync(bundled) ? bundled : fallback);
  }
}

app.whenReady().then(() => {
  try {
    store = new SqliteSaveStore(join(app.getPath('userData'), 'saves.db'));
  } catch (err) {
    console.error('세이브 저장소 초기화 실패', err);
    dialog.showErrorBox(
      '세이브 저장소를 열 수 없습니다',
      '저장 파일이 손상되었거나, 디스크 공간이 부족하거나, 쓰기 권한이 없을 수 있습니다.\n' +
      `자세한 내용: ${err instanceof Error ? err.message : String(err)}`,
    );
    app.quit();
    return;
  }
  registerSaveIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  store?.close();
});

// 렌더러가 아닌 메인 프로세스에서 예기치 못한 예외가 나도 전체 프로세스가 죽지 않도록
// 마지막 방어선을 둔다 — IPC 핸들러는 이미 각자 try/catch로 감쌌지만, 그 밖의 경로를 대비.
process.on('uncaughtException', (err) => {
  console.error('처리되지 않은 예외', err);
});
