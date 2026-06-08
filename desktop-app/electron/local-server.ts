import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import axios from 'axios';

interface ServerStatus {
  running: boolean;
  port: number | null;
}

export class ServerManager {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private port: number | null = null;

  private get logDir(): string {
    const dir = path.join(os.homedir(), 'AppData', 'Roaming', 'FileBeam', 'logs');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private get devScriptPath(): string {
    return path.resolve(__dirname, '../../../local-server/main.py');
  }

  private get packagedExePath(): string {
    return path.join(process.resourcesPath, 'server', 'filebeam-server.exe');
  }

  async start(): Promise<ServerStatus> {
    if (this.proc) {
      return this.getStatus();
    }

    const isDev = !appIsPackaged();
    const command = isDev ? 'python' : this.packagedExePath;
    const args = isDev ? [this.devScriptPath] : [];
    const cwd = isDev ? path.dirname(this.devScriptPath) : path.dirname(this.packagedExePath);

    this.proc = spawn(command, args, {
      cwd,
      windowsHide: true,
      shell: false,
    });

    const output = fs.createWriteStream(path.join(this.logDir, 'server.log'), { flags: 'a' });
    this.proc.stdout.pipe(output);
    this.proc.stderr.pipe(output);
    this.proc.on('exit', () => {
      this.proc = null;
      this.port = null;
    });

    for (let attempt = 0; attempt < 20; attempt += 1) {
      for (let candidatePort = 8765; candidatePort <= 8775; candidatePort += 1) {
        try {
          const response = await axios.get<{ status?: string }>(`http://127.0.0.1:${candidatePort}/health`, { timeout: 500 });
          if (response.data?.status === 'ok') {
            this.port = candidatePort;
            return { running: true, port: candidatePort };
          }
        } catch {
          // ignore while probing ports during startup
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return { running: false, port: null };
  }

  async stop(): Promise<boolean> {
    if (!this.proc) {
      return true;
    }
    this.proc.kill();
    this.proc = null;
    this.port = null;
    return true;
  }

  async restart(): Promise<ServerStatus> {
    await this.stop();
    return this.start();
  }

  async getStatus(): Promise<ServerStatus> {
    return { running: this.proc !== null, port: this.port };
  }

  async getPort(): Promise<number | null> {
    return this.port;
  }

  async getLocalIP(): Promise<string> {
    const networks = os.networkInterfaces();
    for (const entries of Object.values(networks)) {
      for (const entry of entries ?? []) {
        if (entry.family === 'IPv4' && !entry.internal) {
          return entry.address;
        }
      }
    }
    return '127.0.0.1';
  }

  async getAllIPs(): Promise<string[]> {
    const networks = os.networkInterfaces();
    return Object.values(networks).flatMap((entries) =>
      (entries ?? [])
        .filter((entry) => entry.family === 'IPv4' && !entry.internal)
        .map((entry) => entry.address),
    );
  }

  async checkInternet(): Promise<boolean> {
    try {
      await axios.get('https://www.google.com/generate_204', { timeout: 1500 });
      return true;
    } catch {
      return false;
    }
  }

  async scanLanDevices(): Promise<unknown[]> {
    if (!this.port) {
      return [];
    }
    try {
      const response = await axios.get(`http://127.0.0.1:${this.port}/discovery/scan`, { timeout: 3000 });
      return response.data as unknown[];
    } catch {
      return [];
    }
  }
}

function appIsPackaged(): boolean {
  return !process.env.VITE_DEV_SERVER_URL;
}
