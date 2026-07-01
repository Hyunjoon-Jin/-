/**
 * Electron 메인 프로세스.
 * 렌더러(packages/app 빌드)를 BrowserWindow로 로드하고,
 * SQLite 세이브 저장소를 IPC(sendSync)로 노출한다.
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SqliteSaveStore, type SaveMeta } from './sqliteStore';

let store: SqliteSaveStore;

function registerSaveIpc(): void {
  ipcMain.on('save:list', (e) => { e.returnValue = store.list(); });
  ipcMain.on('save:load', (e, id: string) => { e.returnValue = store.load(id); });
  ipcMain.on('save:save', (e, id: string, json: string, meta: Omit<SaveMeta, 'id'>) => {
    store.save(id, json, meta);
    e.returnValue = true;
  });
  ipcMain.on('save:remove', (e, id: string) => { store.remove(id); e.returnValue = true; });
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
  store = new SqliteSaveStore(join(app.getPath('userData'), 'saves.db'));
  registerSaveIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
