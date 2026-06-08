type RegistryValueType = 'REG_SZ';

interface RegistryKey {
  set(name: string, type: RegistryValueType, value: string, callback: (error: Error | null | undefined) => void): void;
  remove(name: string, callback: (error?: Error | null) => void): void;
  get(name: string, callback: (error: Error | null | undefined) => void): void;
}

interface RegistryConstructor {
  new(options: { hive: string; key: string }): RegistryKey;
  HKCU: string;
  REG_SZ: RegistryValueType;
}

const Registry = require('winreg') as RegistryConstructor;
const key = new Registry({ hive: Registry.HKCU, key: '\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' });
const APP_NAME = 'FileBeam';

export const enableStartup = async (exePath: string): Promise<void> =>
  new Promise((resolve, reject) => {
    key.set(APP_NAME, Registry.REG_SZ, `"${exePath}"`, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

export const disableStartup = async (): Promise<void> =>
  new Promise((resolve) => {
    key.remove(APP_NAME, () => resolve());
  });

export const isStartupEnabled = async (): Promise<boolean> =>
  new Promise((resolve) => {
    key.get(APP_NAME, (error) => resolve(!error));
  });
