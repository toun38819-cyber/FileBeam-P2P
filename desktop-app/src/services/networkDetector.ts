import type { DeviceInfo } from '@/types';
export const getLocalIP = async (): Promise<string> => window.filebeam.network.getLocalIP();
export const getAllLocalIPs = async (): Promise<string[]> => window.filebeam.network.getAllIPs();
export const checkInternet = async (): Promise<boolean> => window.filebeam.network.checkInternet();
export const isSameSubnet = async (a: string, b: string): Promise<boolean> => window.filebeam.network.checkSameSubnet(a, b);
export const scanLanDevices = async (): Promise<DeviceInfo[]> => window.filebeam.network.scanLanDevices();
