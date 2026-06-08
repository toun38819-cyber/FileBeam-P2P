import { autoUpdater } from 'electron-updater';
export function initUpdater(): void { autoUpdater.autoDownload = false; void autoUpdater.checkForUpdatesAndNotify().catch(() => undefined); }
