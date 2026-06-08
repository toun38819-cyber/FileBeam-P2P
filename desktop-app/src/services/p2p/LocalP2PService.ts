import axios from 'axios';
import { encryptChunk, readTransferItemChunk, sha256Buffer, sha256TransferItem } from '@/services/fileChunker';
import type {
  DeviceInfo,
  InitiateTransferResponse,
  ResumeTransferInfo,
  RoomData,
  RoomSocketMessage,
  SendTransferResult,
  TransferItem,
} from '@/types';

const MB = 1024 * 1024;

export class TransferResumeRequiredError extends Error {
  transferId: string;
  missingChunks: number[];
  retryCount: number;
  duplicateChunks: number;

  constructor(message: string, transferId: string, missingChunks: number[], retryCount: number, duplicateChunks = 0) {
    super(message);
    this.name = 'TransferResumeRequiredError';
    this.transferId = transferId;
    this.missingChunks = missingChunks;
    this.retryCount = retryCount;
    this.duplicateChunks = duplicateChunks;
  }
}

export class TransferDiskFullError extends Error {
  transferId: string;

  constructor(message: string, transferId: string) {
    super(message);
    this.name = 'TransferDiskFullError';
    this.transferId = transferId;
  }
}

export class LocalP2PService {
  private peerBaseURL = '';
  private encryptionKey = '';
  private roomId = '';
  private ws: WebSocket | null = null;
  private eventHandler: ((message: RoomSocketMessage) => void) | null = null;

  private readonly chunkSize = 10 * MB;
  private readonly parallel = 8;
  private readonly maxChunkRetries = 3;
  private readonly maxResumeRounds = 4;

  setEventHandler(handler: ((message: RoomSocketMessage) => void) | null): void {
    this.eventHandler = handler;
  }

  private openSocket(url: string): void {
    this.ws?.close();
    this.ws = new WebSocket(url);
    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as RoomSocketMessage;
        this.eventHandler?.(message);
      } catch {
        // ignore malformed websocket payloads
      }
    };
  }

  async joinRoom(roomData: RoomData, localDevice: DeviceInfo): Promise<void> {
    const hostDevice: DeviceInfo = {
      device_name: roomData.qr_data.dn,
      device_type: roomData.qr_data.dt,
      ip: roomData.device_ip,
      port: roomData.device_port,
      os: roomData.qr_data.dt,
    };

    await axios.post(`http://127.0.0.1:${localDevice.port}/room/import`, {
      room_id: roomData.room_id,
      encryption_key: roomData.encryption_key,
      transfer_mode: roomData.qr_data.mode,
      host_device: hostDevice,
      local_device: localDevice,
    });

    this.peerBaseURL = `http://${roomData.device_ip}:${roomData.device_port}`;
    this.encryptionKey = roomData.encryption_key;
    this.roomId = roomData.room_id;

    await axios.post(`${this.peerBaseURL}/room/join`, {
      room_id: roomData.room_id,
      device_name: localDevice.device_name,
      device_type: localDevice.device_type,
      joiner_ip: localDevice.ip,
      joiner_port: localDevice.port,
      os: localDevice.os ?? localDevice.device_type,
    });

    this.openSocket(`ws://${roomData.device_ip}:${roomData.device_port}/ws/room/${roomData.room_id}`);
  }

  async bindPeer(roomData: RoomData): Promise<void> {
    this.peerBaseURL = `http://${roomData.device_ip}:${roomData.device_port}`;
    this.encryptionKey = roomData.encryption_key;
    this.roomId = roomData.room_id;
    this.openSocket(`ws://${roomData.device_ip}:${roomData.device_port}/ws/room/${roomData.room_id}`);
  }

  private chunkByteLength(fileSize: number, chunkIndex: number): number {
    const start = chunkIndex * this.chunkSize;
    const end = Math.min(start + this.chunkSize, fileSize);
    return Math.max(0, end - start);
  }

  private computeAcknowledgedBytes(fileSize: number, totalChunks: number, missingChunks: number[]): number {
    const missing = new Set(missingChunks);
    let bytes = 0;
    for (let index = 0; index < totalChunks; index += 1) {
      if (!missing.has(index)) {
        bytes += this.chunkByteLength(fileSize, index);
      }
    }
    return bytes;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  private getErrorStatus(error: unknown): number | undefined {
    return axios.isAxiosError(error) ? error.response?.status : undefined;
  }

  private extractErrorMessage(error: unknown, fallback: string): string {
    if (axios.isAxiosError(error)) {
      const detail = error.response?.data?.detail;
      if (typeof detail === 'string') {
        return detail;
      }
      if (detail && typeof detail.message === 'string') {
        return detail.message;
      }
      return error.message || fallback;
    }
    return error instanceof Error ? error.message : fallback;
  }

  private isRetryableError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
      return true;
    }
    if (!error.response) {
      return true;
    }
    const status = error.response.status;
    return status >= 500 || status === 408 || status === 409 || status === 429;
  }

  private normalizeResumeState(
    transferId: string,
    state: ResumeTransferInfo | null | undefined,
    fallbackMissingChunks: number[],
    fallbackBytesReceived: number,
  ): ResumeTransferInfo {
    return state ?? {
      transfer_id: transferId,
      status: 'paused',
      received_count: 0,
      bytes_received: fallbackBytesReceived,
      missing_chunks: fallbackMissingChunks,
      can_resume: true,
      duplicate_chunks: 0,
      chunk_attempts: {},
      error_code: 'resume_required',
      error_message: 'Transfer requires resume.',
      last_activity_at: new Date().toISOString(),
    };
  }

  private async initiateTransfer(item: TransferItem, transferId: string, sender: DeviceInfo): Promise<InitiateTransferResponse> {
    const totalChunks = Math.ceil(item.size / this.chunkSize);
    const response = await axios.post<InitiateTransferResponse>(`${this.peerBaseURL}/transfer/send/initiate`, {
      room_id: this.roomId,
      transfer_id: transferId,
      filename: item.name,
      filesize: item.size,
      filetype: item.type || 'application/octet-stream',
      total_chunks: totalChunks,
      checksum_full: await sha256TransferItem(item),
      compression: 'none',
      sender,
    });
    return response.data;
  }

  private async fetchResumeState(transferId: string): Promise<ResumeTransferInfo | null> {
    try {
      const response = await axios.get<ResumeTransferInfo>(`${this.peerBaseURL}/transfer/resume/${transferId}`);
      return response.data;
    } catch {
      return null;
    }
  }

  private async uploadChunk(item: TransferItem, transferId: string, totalChunks: number, chunkIndex: number): Promise<{ duplicate: boolean }> {
    const begin = chunkIndex * this.chunkSize;
    const end = Math.min(begin + this.chunkSize, item.size);
    const buffer = await readTransferItemChunk(item, begin, end);
    const encrypted = await encryptChunk(new Uint8Array(buffer), this.encryptionKey, chunkIndex);
    const checksum = await sha256Buffer(buffer);

    for (let attempt = 1; attempt <= this.maxChunkRetries; attempt += 1) {
      const form = new FormData();
      form.append('room_id', this.roomId);
      form.append('transfer_id', transferId);
      form.append('chunk_index', String(chunkIndex));
      form.append('total_chunks', String(totalChunks));
      form.append('checksum', checksum);
      form.append('is_last', String(chunkIndex === totalChunks - 1));
      form.append('chunk_data', new Blob([encrypted]), `${item.name}.part`);

      try {
        const response = await axios.post<{ duplicate?: boolean }>(`${this.peerBaseURL}/transfer/chunk`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 45000,
        });
        return { duplicate: Boolean(response.data.duplicate) };
      } catch (error) {
        const status = this.getErrorStatus(error);
        if (status === 507) {
          throw new TransferDiskFullError(this.extractErrorMessage(error, 'Receiver device is out of disk space.'), transferId);
        }
        if (attempt >= this.maxChunkRetries || !this.isRetryableError(error)) {
          throw error;
        }
        await this.delay(250 * attempt);
      }
    }

    return { duplicate: false };
  }

  async sendFile(
    item: TransferItem,
    transferId: string,
    sender: DeviceInfo,
    onProgress: (payload: { bytesUploaded: number; totalBytes: number; speed: number; chunkIndex: number; resumed: boolean; retryCount: number; missingChunks: number[]; duplicateChunks: number }) => void,
  ): Promise<SendTransferResult> {
    const totalChunks = Math.ceil(item.size / this.chunkSize);
    const startedAt = performance.now();
    const initiated = await this.initiateTransfer(item, transferId, sender);

    let missingChunks = [...initiated.missing_chunks].sort((a, b) => a - b);
    let retryCount = 0;
    let duplicateChunks = 0;
    let resumed = initiated.resume || missingChunks.length !== totalChunks;
    let acknowledged = this.computeAcknowledgedBytes(item.size, totalChunks, missingChunks);

    onProgress({
      bytesUploaded: acknowledged,
      totalBytes: item.size,
      speed: 0,
      chunkIndex: -1,
      resumed,
      retryCount,
      missingChunks,
      duplicateChunks,
    });

    if (!missingChunks.length) {
      return { transferId, resumed, retryCount, duplicateChunks, missingChunks };
    }

    for (let round = 0; round < this.maxResumeRounds; round += 1) {
      try {
        for (let start = 0; start < missingChunks.length; start += this.parallel) {
          const batch = missingChunks.slice(start, start + this.parallel);
          await Promise.all(batch.map(async (chunkIndex) => {
            const result = await this.uploadChunk(item, transferId, totalChunks, chunkIndex);
            if (result.duplicate) {
              duplicateChunks += 1;
            }
            const chunkBytes = this.chunkByteLength(item.size, chunkIndex);
            acknowledged += chunkBytes;
            const elapsed = Math.max((performance.now() - startedAt) / 1000, 0.001);
            onProgress({
              bytesUploaded: Math.min(acknowledged, item.size),
              totalBytes: item.size,
              speed: Math.min(acknowledged, item.size) / elapsed,
              chunkIndex,
              resumed,
              retryCount,
              missingChunks,
              duplicateChunks,
            });
          }));
        }

        const resumeState = await this.fetchResumeState(transferId);
        const normalized = this.normalizeResumeState(transferId, resumeState, missingChunks, acknowledged);
        missingChunks = [...normalized.missing_chunks].sort((a, b) => a - b);
        duplicateChunks = Math.max(duplicateChunks, normalized.duplicate_chunks);
        acknowledged = Math.max(acknowledged, normalized.bytes_received);
        if (missingChunks.length > 0) {
          resumed = true;
        }

        if (!missingChunks.length) {
          const elapsed = Math.max((performance.now() - startedAt) / 1000, 0.001);
          onProgress({
            bytesUploaded: item.size,
            totalBytes: item.size,
            speed: item.size / elapsed,
            chunkIndex: totalChunks - 1,
            resumed,
            retryCount,
            missingChunks,
            duplicateChunks,
          });
          return { transferId, resumed, retryCount, duplicateChunks, missingChunks };
        }
      } catch (error) {
        if (error instanceof TransferDiskFullError) {
          throw error;
        }
        retryCount += 1;
        const resumeState = await this.fetchResumeState(transferId);
        const normalized = this.normalizeResumeState(transferId, resumeState, missingChunks, acknowledged);
        missingChunks = [...normalized.missing_chunks].sort((a, b) => a - b);
        duplicateChunks = Math.max(duplicateChunks, normalized.duplicate_chunks);
        acknowledged = Math.max(acknowledged, normalized.bytes_received);
        resumed = true;

        if (!missingChunks.length) {
          return { transferId, resumed, retryCount, duplicateChunks, missingChunks };
        }

        onProgress({
          bytesUploaded: Math.min(acknowledged, item.size),
          totalBytes: item.size,
          speed: 0,
          chunkIndex: -1,
          resumed,
          retryCount,
          missingChunks,
          duplicateChunks,
        });

        if (!normalized.can_resume || retryCount >= this.maxResumeRounds) {
          throw new TransferResumeRequiredError(
            normalized.error_message || this.extractErrorMessage(error, 'Transfer paused and requires resume.'),
            transferId,
            missingChunks,
            retryCount,
            duplicateChunks,
          );
        }

        await this.delay(500 * retryCount);
      }
    }

    throw new TransferResumeRequiredError('Transfer paused. Retry to send remaining chunks.', transferId, missingChunks, retryCount, duplicateChunks);
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
