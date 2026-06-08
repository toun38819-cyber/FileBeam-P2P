import { Menu, Tray, app } from 'electron';
import path from 'node:path';
export function createTray(onShow: () => void, getServerStatus: () => Promise<{ running: boolean; port: number | null }>): Tray {
  const tray = new Tray(path.join(app.getAppPath(), 'assets', 'tray-icon.ico'));
  const refresh = async (): Promise<void> => {
    const status = await getServerStatus();
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'FileBeam v1.0.0', enabled: false },
      { type: 'separator' },
      { label: '▶ Show Window', click: onShow },
      { type: 'separator' },
      { label: status.running ? `🟢 Server Running :${status.port ?? '—'}` : '🔴 Server Stopped', enabled: false },
      { type: 'separator' },
      { label: '✕ Quit', click: () => app.quit() }
    ]));
  };
  tray.on('double-click', onShow);
  tray.setToolTip('FileBeam');
  void refresh();
  return tray;
}
