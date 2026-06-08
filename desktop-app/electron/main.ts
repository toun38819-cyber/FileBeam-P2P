import { app, BrowserWindow, dialog, ipcMain, nativeTheme, Notification, shell } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import axios from 'axios';
import mime from 'mime-types';
import { ensureFirewallRules, isFirewallRulePresent } from './firewall';
import { ServerManager } from './local-server';
import { disableStartup, enableStartup, isStartupEnabled } from './startup';
import { createTray } from './tray';
import { initUpdater } from './updater';

let mainWindow: BrowserWindow | null = null;
const server = new ServerManager();

interface ServerHealthResponse {
  status?: string;
}

const apiBase = async (): Promise<string> => `http://127.0.0.1:${(await server.getPort()) ?? 8765}`;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0A0A1A',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    await mainWindow.loadURL(devUrl);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../web/index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show());
}

async function ensureMainWindow(): Promise<BrowserWindow> {
  if (!mainWindow) {
    await createWindow();
  }
  return mainWindow as BrowserWindow;
}

function registerIpc(): void {
  ipcMain.handle('server:start', async () => server.start());
  ipcMain.handle('server:stop', async () => server.stop());
  ipcMain.handle('server:restart', async () => server.restart());
  ipcMain.handle('server:status', async () => server.getStatus());
  ipcMain.handle('server:get-port', async () => server.getPort());

  ipcMain.handle('room:create', async (_event, payload: unknown) => (await axios.post(`${await apiBase()}/room/create`, payload)).data);
  ipcMain.handle('room:join', async (_event, payload: unknown) => (await axios.post(`${await apiBase()}/room/join`, payload)).data);
  ipcMain.handle('room:status', async (_event, roomId: string) => (await axios.get(`${await apiBase()}/room/${roomId}/status`)).data);
  ipcMain.handle('room:destroy', async () => true);

  ipcMain.handle('network:get-local-ip', async () => server.getLocalIP());
  ipcMain.handle('network:get-all-ips', async () => server.getAllIPs());
  ipcMain.handle('network:check-internet', async () => server.checkInternet());
  ipcMain.handle('network:check-same-subnet', async (_event, a: string, b: string) => a.split('.').slice(0, 3).join('.') === b.split('.').slice(0, 3).join('.'));
  ipcMain.handle('network:scan-lan-devices', async () => server.scanLanDevices());

  ipcMain.handle('fs:open-file-dialog', async () => {
    const windowRef = await ensureMainWindow();
    const result = await dialog.showOpenDialog(windowRef, { properties: ['openFile', 'multiSelections'] });
    return result.filePaths;
  });
  ipcMain.handle('fs:open-folder-dialog', async () => {
    const windowRef = await ensureMainWindow();
    const result = await dialog.showOpenDialog(windowRef, { properties: ['openDirectory'] });
    return result.filePaths[0] ?? '';
  });
  ipcMain.handle('fs:save-dialog', async (_event, defaultPath: string) => {
    const windowRef = await ensureMainWindow();
    const result = await dialog.showSaveDialog(windowRef, { defaultPath });
    return result.filePath ?? '';
  });
  ipcMain.handle('fs:show-in-explorer', async (_event, targetPath: string) => shell.showItemInFolder(targetPath));
  ipcMain.handle('fs:open-path', async (_event, targetPath: string) => shell.openPath(targetPath));
  ipcMain.handle('fs:get-downloads-path', async () => path.join(os.homedir(), 'Downloads', 'FileBeam'));
  ipcMain.handle('fs:get-temp-path', async () => os.tmpdir());
  ipcMain.handle('fs:get-app-data-path', async () => app.getPath('userData'));
  ipcMain.handle('fs:clear-temp-files', async () => ({ freedMB: 0 }));
  ipcMain.handle('fs:get-temp-size', async () => 0);
  ipcMain.handle('fs:get-file-metadata', async (_event, filePaths: string[]) => {
    return Promise.all(filePaths.map(async (filePath) => {
      const stats = await fs.promises.stat(filePath);
      return {
        path: filePath,
        name: path.basename(filePath),
        size: stats.size,
        type: String(mime.lookup(filePath) || 'application/octet-stream'),
      };
    }));
  });
  ipcMain.handle('fs:read-file-chunk', async (_event, filePath: string, start: number, length: number) => {
    const handle = await fs.promises.open(filePath, 'r');
    try {
      const safeLength = Math.max(0, length);
      const buffer = Buffer.alloc(safeLength);
      const { bytesRead } = await handle.read(buffer, 0, safeLength, start);
      return buffer.subarray(0, bytesRead).toString('base64');
    } finally {
      await handle.close();
    }
  });
  ipcMain.handle('fs:sha256-file', async (_event, filePath: string) => {
    return new Promise<string>((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk: string | Buffer) => {
        hash.update(chunk);
      });
      stream.on('error', reject);
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  });

  ipcMain.handle('win:open-hotspot-settings', async () => shell.openExternal('ms-settings:network-mobilehotspot'));
  ipcMain.handle('win:open-network-settings', async () => shell.openExternal('ms-settings:network'));
  ipcMain.handle('win:open-wifi-settings', async () => shell.openExternal('ms-settings:network-wifi'));
  ipcMain.handle('win:setup-firewall', async () => ensureFirewallRules());
  ipcMain.handle('win:check-firewall', async () => isFirewallRulePresent());
  ipcMain.handle('win:enable-startup', async () => enableStartup(app.getPath('exe')));
  ipcMain.handle('win:disable-startup', async () => disableStartup());
  ipcMain.handle('win:is-startup-enabled', async () => isStartupEnabled());

  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return;
    }
    mainWindow.maximize();
  });
  ipcMain.handle('window:close', () => mainWindow?.close());
  ipcMain.handle('window:is-maximized', () => Boolean(mainWindow?.isMaximized()));
  ipcMain.handle('window:set-title', (_event, title: string) => mainWindow?.setTitle(title));

  ipcMain.handle('notify:transfer-complete', async (_event, title: string, body: string) => {
    new Notification({ title, body }).show();
  });
  ipcMain.handle('notify:device-connected', async (_event, deviceName: string) => {
    new Notification({ title: 'FileBeam', body: `${deviceName} connected` }).show();
  });
  ipcMain.handle('notify:transfer-request', async (_event, filename: string) => {
    new Notification({ title: 'Incoming Transfer', body: filename }).show();
  });

  ipcMain.handle('webcam:get-devices', async () => []);
  ipcMain.handle('webcam:request-permission', async () => true);
}

async function waitForServerHealth(): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const port = await server.getPort();
    if (port) {
      try {
        const response = await axios.get<ServerHealthResponse>(`http://127.0.0.1:${port}/health`, { timeout: 500 });
        if (response.data?.status === 'ok') {
          return;
        }
      } catch {
        // ignore startup health race and continue probing
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

app.whenReady().then(async () => {
  registerIpc();
  initUpdater();
  await server.start();
  await waitForServerHealth();
  await ensureFirewallRules();
  await createWindow();
  createTray(() => mainWindow?.show(), () => server.getStatus());
  nativeTheme.themeSource = 'dark';
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  await server.stop();
});
