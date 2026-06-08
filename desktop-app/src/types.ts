export type ConnectionMode = 'local' | 'webrtc';
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'recovered';
export type TransferStatus = 'idle' | 'running' | 'paused' | 'complete' | 'error' | 'cancelled';

export interface DeviceInfo {
  device_name: string;
  device_type: string;
  ip: string;
  port: number;
  os?: string;
}

export interface QRPayload {
  v: number;
  mode: ConnectionMode;
  rid: string;
  ip: string;
  port: number;
  sig?: string;
  key: string;
  dn: string;
  dt: string;
  exp: number;
}

export interface RoomData {
  room_id: string;
  room_code: string;
  device_ip: string;
  device_port: number;
  encryption_key: string;
  qr_data: QRPayload;
  qr_image_base64: string;
  expires_at: string;
}

export interface TransferItem {
  id: string;
  name: string;
  size: number;
  type: string;
  file?: File;
  path?: string;
  persistable?: boolean;
}

export interface TransferProgressModel {
  transferId: string;
  filename: string;
  direction: 'send' | 'receive';
  totalBytes: number;
  transferredBytes: number;
  speed: number;
  etaSeconds: number;
  progress: number;
  fileIndex?: number;
  fileCount?: number;
  savePath?: string;
  status: TransferStatus;
  errorMessage?: string;
  errorCode?: string;
  missingChunks?: number[];
  duplicateChunks?: number;
  retryCount?: number;
  resumed?: boolean;
}

export interface HistoryEntry {
  id: string;
  filename: string;
  size: number;
  direction: 'send' | 'receive';
  speedMBps: number;
  peerName: string;
  createdAt: string;
  path?: string;
}

export interface ResumeTransferInfo {
  transfer_id: string;
  status: string;
  received_count: number;
  bytes_received: number;
  missing_chunks: number[];
  can_resume: boolean;
  duplicate_chunks: number;
  chunk_attempts: Record<string, number>;
  error_code?: string | null;
  error_message?: string | null;
  last_activity_at: string;
}

export interface InitiateTransferResponse {
  ready: boolean;
  transfer_id: string;
  resume: boolean;
  missing_chunks: number[];
  received_count?: number;
}

export interface SendTransferResult {
  transferId: string;
  resumed: boolean;
  retryCount: number;
  duplicateChunks: number;
  missingChunks: number[];
}

export interface ActiveTransferSnapshot {
  transfer_id: string;
  room_id: string;
  filename: string;
  filesize: number;
  total_chunks: number;
  bytes_received: number;
  received_chunks: number;
  complete: boolean;
  status: string;
  missing_chunks: number[];
  can_resume: boolean;
  duplicate_chunks: number;
  last_activity_at: string;
  error_code?: string | null;
  error_message?: string | null;
  sender?: DeviceInfo | null;
  created_at: string;
}

export interface RoomSocketMessage {
  type: string;
  [key: string]: unknown;
}

export interface FileBeamAPI {
  server: {
    start(): Promise<unknown>;
    stop(): Promise<unknown>;
    restart(): Promise<unknown>;
    status(): Promise<{ running: boolean; port: number | null }>;
    getPort(): Promise<number | null>;
  };
  room: {
    create(payload: unknown): Promise<RoomData>;
    join(payload: unknown): Promise<unknown>;
    status(roomId: string): Promise<unknown>;
    destroy(roomId: string): Promise<unknown>;
  };
  network: {
    getLocalIP(): Promise<string>;
    getAllIPs(): Promise<string[]>;
    checkInternet(): Promise<boolean>;
    checkSameSubnet(a: string, b: string): Promise<boolean>;
    scanLanDevices(): Promise<DeviceInfo[]>;
  };
  fs: {
    openFileDialog(): Promise<string[]>;
    openFolderDialog(): Promise<string>;
    saveDialog(defaultPath: string): Promise<string>;
    showInExplorer(targetPath: string): Promise<void>;
    openPath(targetPath: string): Promise<void>;
    getDownloadsPath(): Promise<string>;
    getTempPath(): Promise<string>;
    getAppDataPath(): Promise<string>;
    clearTempFiles(): Promise<{ freedMB: number }>;
    getTempSize(): Promise<number>;
    getFileMetadata(paths: string[]): Promise<Array<{ path: string; name: string; size: number; type: string }>>;
    readFileChunk(path: string, start: number, length: number): Promise<string>;
    sha256File(path: string): Promise<string>;
  };
  win: {
    openHotspotSettings(): Promise<void>;
    openNetworkSettings(): Promise<void>;
    openWifiSettings(): Promise<void>;
    setupFirewall(): Promise<boolean>;
    checkFirewall(): Promise<boolean>;
    enableStartup(): Promise<void>;
    disableStartup(): Promise<void>;
    isStartupEnabled(): Promise<boolean>;
  };
  window: {
    minimize(): Promise<void>;
    maximize(): Promise<void>;
    close(): Promise<void>;
    isMaximized(): Promise<boolean>;
    setTitle(title: string): Promise<void>;
  };
  notify: {
    transferComplete(title: string, body: string): Promise<void>;
    deviceConnected(deviceName: string): Promise<void>;
    transferRequest(filename: string): Promise<void>;
  };
  webcam: {
    getDevices(): Promise<MediaDeviceInfo[]>;
    requestPermission(): Promise<boolean>;
  };
}

declare global {
  interface Window {
    filebeam: FileBeamAPI;
  }
}
