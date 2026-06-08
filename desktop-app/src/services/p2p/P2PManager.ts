import { checkInternet, getLocalIP, isSameSubnet } from '@/services/networkDetector';
import type { ConnectionMode, DeviceInfo, RoomData, RoomSocketMessage, SendTransferResult, TransferItem } from '@/types';
import { LocalP2PService } from './LocalP2PService';
import { WebRTCService } from './WebRTCService';

export class P2PManager {
  private mode: ConnectionMode = 'local';
  private readonly localService = new LocalP2PService();
  private readonly webrtcService = new WebRTCService();

  constructor(onEvent?: (event: RoomSocketMessage) => void) {
    if (onEvent) {
      this.localService.setEventHandler(onEvent);
    }
  }

  setEventHandler(handler: ((event: RoomSocketMessage) => void) | null): void {
    this.localService.setEventHandler(handler);
  }

  async detectAndConnect(roomData: RoomData, localDevice: DeviceInfo): Promise<ConnectionMode> {
    const localIP = await getLocalIP();
    if (await isSameSubnet(localIP, roomData.device_ip)) {
      this.mode = 'local';
      await this.localService.joinRoom(roomData, localDevice);
      return this.mode;
    }

    this.mode = (await checkInternet()) ? 'webrtc' : 'local';
    if (this.mode === 'local') {
      await this.localService.joinRoom(roomData, localDevice);
    } else {
      await this.webrtcService.connectAsGuest(roomData.room_id, String(roomData.qr_data.sig ?? 'wss://signal.filebeam.app'));
    }
    return this.mode;
  }

  async connectExplicit(roomData: RoomData, mode: ConnectionMode): Promise<void> {
    this.mode = mode;
    if (mode === 'local') {
      await this.localService.bindPeer(roomData);
    } else {
      await this.webrtcService.connectAsGuest(roomData.room_id, String(roomData.qr_data.sig ?? 'wss://signal.filebeam.app'));
    }
  }

  async sendFile(
    item: TransferItem,
    transferId: string,
    sender: DeviceInfo,
    onProgress: (progress: { bytesUploaded: number; totalBytes: number; speed: number; chunkIndex?: number; resumed?: boolean; retryCount?: number; missingChunks?: number[]; duplicateChunks?: number }) => void,
  ): Promise<SendTransferResult> {
    if (this.mode === 'local') {
      return this.localService.sendFile(item, transferId, sender, onProgress as (payload: { bytesUploaded: number; totalBytes: number; speed: number; chunkIndex: number; resumed: boolean; retryCount: number; missingChunks: number[]; duplicateChunks: number }) => void);
    }

    if (!item.file) {
      throw new Error('WebRTC mode currently requires a live file handle. Re-select the file to continue.');
    }
    await this.webrtcService.sendFile(item.file, ({ bytesUploaded, totalBytes, speed }) => onProgress({ bytesUploaded, totalBytes, speed }));
    return { transferId, resumed: false, retryCount: 0, duplicateChunks: 0, missingChunks: [] };
  }

  disconnect(): void {
    this.localService.disconnect();
    this.webrtcService.disconnect();
  }

  getConnectionStats(): { mode: ConnectionMode; speed: number; ping: number; bytesTransferred: number } {
    return { mode: this.mode, speed: 0, ping: this.mode === 'local' ? 2 : 24, bytesTransferred: 0 };
  }
}
