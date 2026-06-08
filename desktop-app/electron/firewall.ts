import { execFile } from 'node:child_process';
export const ensureFirewallRules = async (): Promise<boolean> => {
  if (process.platform !== 'win32') return true;
  return new Promise((resolve) => execFile('netsh', ['advfirewall', 'firewall', 'add', 'rule', 'name=FileBeam', 'dir=in', 'action=allow', 'protocol=TCP', 'localport=8765-8775'], { windowsHide: true }, () => resolve(true)));
};
export const isFirewallRulePresent = async (): Promise<boolean> => {
  if (process.platform !== 'win32') return true;
  return new Promise((resolve) => execFile('netsh', ['advfirewall', 'firewall', 'show', 'rule', 'name=FileBeam'], { windowsHide: true }, (error) => resolve(!error)));
};
