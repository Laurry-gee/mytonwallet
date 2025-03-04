import type { IpcRendererEvent } from 'electron';
import { contextBridge, ipcRenderer } from 'electron';

import { ElectronAction } from './types';
import type { ElectronApi, ElectronEvent } from './types';

const electronApi: ElectronApi = {
  close: () => ipcRenderer.invoke(ElectronAction.CLOSE),
  minimize: () => ipcRenderer.invoke(ElectronAction.MINIMIZE),
  maximize: () => ipcRenderer.invoke(ElectronAction.MAXIMIZE),
  unmaximize: () => ipcRenderer.invoke(ElectronAction.UNMAXIMIZE),
  getIsMaximized: () => ipcRenderer.invoke(ElectronAction.GET_IS_MAXIMIZED),

  downloadUpdate: () => ipcRenderer.invoke(ElectronAction.DOWNLOAD_UPDATE),
  cancelUpdate: () => ipcRenderer.invoke(ElectronAction.CANCEL_UPDATE),
  installUpdate: () => ipcRenderer.invoke(ElectronAction.INSTALL_UPDATE),
  handleDoubleClick: () => ipcRenderer.invoke(ElectronAction.HANDLE_DOUBLE_CLICK),

  toggleDeeplinkHandler: (isEnabled: boolean) => ipcRenderer.invoke(ElectronAction.TOGGLE_DEEPLINK_HANDLER, isEnabled),

  on: (eventName: ElectronEvent, callback) => {
    const subscription = (event: IpcRendererEvent, ...args: any) => callback(...args);

    ipcRenderer.on(eventName, subscription);

    return () => {
      ipcRenderer.removeListener(eventName, subscription);
    };
  },
};

contextBridge.exposeInMainWorld('electron', electronApi);
