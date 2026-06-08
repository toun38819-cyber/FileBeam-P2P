import type { ConnectionMode } from '../types';
export const detectMode = async (): Promise<ConnectionMode> => 'local';
export const getLocalIP = async (): Promise<string> => '192.168.1.8';
