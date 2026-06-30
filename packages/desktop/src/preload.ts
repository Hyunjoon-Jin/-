/**
 * 프리로드: 렌더러에 SQLite 세이브 API를 안전하게 노출(contextBridge).
 * 렌더러 SaveStore가 동기 인터페이스이므로 sendSync를 사용한다(세이브는 소량·드묾).
 */
import { contextBridge, ipcRenderer } from 'electron';

export interface SaveMeta {
  id: string;
  clubName: string;
  season: number;
  savedAt: string;
}

contextBridge.exposeInMainWorld('saveAPI', {
  list: (): SaveMeta[] => ipcRenderer.sendSync('save:list'),
  load: (id: string): string | null => ipcRenderer.sendSync('save:load', id),
  save: (id: string, json: string, meta: Omit<SaveMeta, 'id'>): void => {
    ipcRenderer.sendSync('save:save', id, json, meta);
  },
  remove: (id: string): void => { ipcRenderer.sendSync('save:remove', id); },
});
