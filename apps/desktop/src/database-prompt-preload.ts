import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('databasePrompt', {
  submit: (url: string) => ipcRenderer.send('database-prompt:submit', url),
  cancel: () => ipcRenderer.send('database-prompt:cancel')
});
