import toast from 'react-hot-toast';
import { api } from '@/services/api';
import { roomService } from '@/services/roomService';
import { usePeerStore } from '@/stores/peerStore';
import { useRoomStore } from '@/stores/roomStore';
import { useTransferStore } from '@/stores/transferStore';
import { useServerStore } from '@/stores/serverStore';
import type {
  ActiveTransferSnapshot,
  ConnectionMode,
  DeviceInfo,
  QRPayload,
  RoomData,
  RoomSocketMessage,
  SendTransferResult,
  TransferProgressModel,
} from '@/types';
import { P2PManager } from './P2PManager';
import { TransferDiskFullError, TransferResumeRequiredError } from './LocalP2PService';

const MB = 1024 * 1024;

interface LocalServerHealth {
  status: string;
  port: number;
  active_transfers?: number;
  paused_transfers?: number;
}

class DesktopRuntime {
  private readonly manager = new P2PManager((event) => void this.handleRoomEvent(event));
  private localRoomWS: WebSocket | null = null;
  private incomingTransfers = new Map<string, { filename: string; filesize: number }>();
  private serverMonitorId: number | null = null;
  private lastHealthyPort: number | null = null;
  private serverWasHealthy = false;
  private recoveryInFlight = false;

  private get roomStore() {
    return useRoomStore.getState();
  }

  private buildProgress(
    base: Partial<TransferProgressModel> & Pick<TransferProgressModel, 'transferId' | 'filename' | 'direction' | 'totalBytes' | 'transferredBytes' | 'speed' | 'etaSeconds' | 'progress' | 'status'>,
  ): TransferProgressModel {
    return {
      fileCount: base.fileCount,
      fileIndex: base.fileIndex,
      savePath: base.savePath,
      errorMessage: base.errorMessage,
      errorCode: base.errorCode,
      missingChunks: base.missingChunks,
      duplicateChunks: base.duplicateChunks,
      retryCount: base.retryCount,
      resumed: base.resumed,
      ...base,
    };
  }

  private normalizeRoomCode(value: string): string {
    return value.trim().toUpperCase();
  }

  private buildRoomDataFromPayload(payload: QRPayload): RoomData {
    return {
      room_id: payload.rid,
      room_code: payload.rid.replace('BEAM-', '').replace('-', ''),
      device_ip: payload.ip,
      device_port: payload.port,
      encryption_key: payload.key,
      qr_data: payload,
      qr_image_base64: '',
      expires_at: new Date(payload.exp * 1000).toISOString(),
    };
  }

  private parseInput(input: string): RoomData {
    const normalized = this.normalizeRoomCode(input);
    const saved = this.roomStore.savedRooms[normalized];
    if (saved) {
      return saved;
    }

    try {
      const payload = JSON.parse(input) as QRPayload & { rid?: string };
      if (payload?.rid) {
        return this.buildRoomDataFromPayload(payload as QRPayload);
      }
    } catch {
      // ignore here and throw friendly error below
    }

    throw new Error('Scan a FileBeam QR code first, or paste the full QR JSON payload.');
  }

  private async getLocalDevice(): Promise<DeviceInfo> {
    const ip = await window.filebeam.network.getLocalIP();
    const port = (await window.filebeam.server.getPort()) ?? 8765;
    return {
      device_name: 'Desktop',
      device_type: 'windows',
      ip,
      port,
      os: 'windows',
    };
  }

  private async fetchActiveTransfers(): Promise<ActiveTransferSnapshot[]> {
    try {
      return await api.get<ActiveTransferSnapshot[]>('/transfer/active');
    } catch {
      return [];
    }
  }

  private applyRecoveredReceiveTransfer(snapshot: ActiveTransferSnapshot): void {
    const progress = snapshot.filesize ? (snapshot.bytes_received / snapshot.filesize) * 100 : 0;
    this.incomingTransfers.set(snapshot.transfer_id, { filename: snapshot.filename, filesize: snapshot.filesize });
    useTransferStore.getState().setActive(this.buildProgress({
      transferId: snapshot.transfer_id,
      filename: snapshot.filename,
      direction: 'receive',
      totalBytes: snapshot.filesize,
      transferredBytes: snapshot.bytes_received,
      speed: 0,
      etaSeconds: 0,
      progress,
      status: snapshot.complete ? 'complete' : 'paused',
      errorCode: snapshot.error_code ?? (snapshot.complete ? undefined : 'server_recovered'),
      errorMessage: snapshot.error_message ?? (snapshot.complete ? undefined : 'Recovered receive session after restart. Waiting for sender to resume if needed.'),
      missingChunks: snapshot.missing_chunks,
      duplicateChunks: snapshot.duplicate_chunks,
      resumed: true,
    }));
  }

  private async fetchServerHealth(): Promise<LocalServerHealth | null> {
    try {
      const status = await window.filebeam.server.status();
      if (!status.running || !status.port) {
        return null;
      }
      const health = await api.get<LocalServerHealth>('/health');
      return health;
    } catch {
      return null;
    }
  }

  private applyServerHealth(health: LocalServerHealth | null, lifecycleStatus?: 'starting' | 'running' | 'reconnecting' | 'offline' | 'recovered'): void {
    if (!health) {
      useServerStore.getState().setHealth({
        running: false,
        port: null,
        activeTransfers: 0,
        pausedTransfers: 0,
        status: lifecycleStatus ?? 'offline',
      });
      return;
    }

    useServerStore.getState().setHealth({
      running: true,
      port: health.port,
      activeTransfers: health.active_transfers ?? 0,
      pausedTransfers: health.paused_transfers ?? 0,
      status: lifecycleStatus ?? 'running',
    });
  }

  async startServerMonitor(): Promise<void> {
    if (this.serverMonitorId !== null) {
      return;
    }
    useServerStore.getState().setStatus('starting');
    const health = await this.fetchServerHealth();
    this.serverWasHealthy = Boolean(health);
    this.lastHealthyPort = health?.port ?? null;
    this.applyServerHealth(health, health ? 'running' : 'offline');
    this.serverMonitorId = window.setInterval(() => {
      void this.pollServerHealth();
    }, 3000);
  }

  stopServerMonitor(): void {
    if (this.serverMonitorId !== null) {
      window.clearInterval(this.serverMonitorId);
      this.serverMonitorId = null;
    }
  }

  async restartLocalServer(): Promise<void> {
    useServerStore.getState().setStatus('reconnecting');
    useServerStore.getState().showBanner('warning', 'Restarting local server', 'FileBeam is restarting its local transfer server and will reattach your session automatically.');
    try {
      await window.filebeam.server.restart();
    } finally {
      await this.pollServerHealth();
    }
  }

  private async pollServerHealth(): Promise<void> {
    const health = await this.fetchServerHealth();
    const isHealthy = Boolean(health);
    const portChanged = Boolean(health && this.lastHealthyPort !== null && health.port !== this.lastHealthyPort);
    const restarted = isHealthy && (!this.serverWasHealthy || portChanged);
    const justWentOffline = !isHealthy && this.serverWasHealthy;

    if (justWentOffline) {
      useServerStore.getState().setStatus('reconnecting');
      useServerStore.getState().showBanner('warning', 'Local server unavailable', 'Trying to reconnect to the FileBeam local server… active room and transfer sessions will be recovered automatically.');
      this.applyServerHealth(null, 'reconnecting');
      if (usePeerStore.getState().peer || useRoomStore.getState().room) {
        usePeerStore.getState().setStatus('reconnecting');
      }
    } else if (!isHealthy && !this.serverWasHealthy) {
      this.applyServerHealth(null, 'offline');
    } else if (health && !restarted) {
      this.applyServerHealth(health, useServerStore.getState().status === 'recovered' ? 'recovered' : 'running');
    }

    this.serverWasHealthy = isHealthy;
    this.lastHealthyPort = health?.port ?? null;

    if (restarted) {
      await this.handleServerRecovered(health as LocalServerHealth);
    }
  }

  private async handleServerRecovered(health: LocalServerHealth): Promise<void> {
    if (this.recoveryInFlight) {
      return;
    }
    this.recoveryInFlight = true;
    try {
      this.applyServerHealth(health, 'reconnecting');
      const room = useRoomStore.getState().room;
      if (room) {
        this.localRoomWS?.close();
        this.localRoomWS = null;
        await this.attachLocalRoomSocket(room.room_id);
      }

      const activeTransfers = await this.fetchActiveTransfers();
      const currentActive = useTransferStore.getState().active;
      const recoveredReceive = activeTransfers.find((item) => !item.complete && item.status !== 'cancelled');

      if (recoveredReceive) {
        this.applyRecoveredReceiveTransfer(recoveredReceive);
      } else if (currentActive?.direction === 'receive' && currentActive.status === 'running') {
        useTransferStore.getState().setActive(this.buildProgress({
          ...currentActive,
          status: 'paused',
          speed: 0,
          etaSeconds: 0,
          errorCode: 'server_recovered',
          errorMessage: 'Local server restarted. Receive session reattached and is waiting for the sender.',
          resumed: true,
        }));
      }

      if (room) {
        try {
          const roomStatus = await roomService.status(room.room_id) as { peer_device?: DeviceInfo | null; host_device?: DeviceInfo | null; status?: string };
          const hosting = useRoomStore.getState().hosting;
          if (hosting && roomStatus.peer_device) {
            usePeerStore.getState().setPeer(roomStatus.peer_device);
            usePeerStore.getState().setStatus('recovered');
          } else if (!hosting && roomStatus.host_device) {
            usePeerStore.getState().setPeer(roomStatus.host_device);
            usePeerStore.getState().setStatus('recovered');
          }
        } catch {
          // keep current UI state if room status is temporarily unavailable
        }
      }

      useServerStore.getState().markRecovered(health.port, health.active_transfers ?? 0, health.paused_transfers ?? 0);
      useServerStore.getState().showBanner('success', 'Local server recovered', 'FileBeam reattached room sockets and restored active transfer state automatically.');
      toast('Local server restarted. FileBeam reattached your session automatically.', { icon: '🔄' });
      window.setTimeout(() => {
        if (useServerStore.getState().status === 'recovered') {
          useServerStore.getState().setStatus('running');
        }
        if (usePeerStore.getState().status === 'recovered') {
          usePeerStore.getState().setStatus(usePeerStore.getState().peer ? 'connected' : 'disconnected');
        }
      }, 5000);
    } finally {
      this.recoveryInFlight = false;
    }
  }

  async restorePersistentSession(): Promise<void> {
    const roomState = useRoomStore.getState();
    const peerState = usePeerStore.getState();
    const transferState = useTransferStore.getState();

    if (roomState.room) {
      try {
        await this.attachLocalRoomSocket(roomState.room.room_id);
      } catch {
        // ignore restore socket failures until the user reconnects
      }
    }

    if (peerState.peer) {
      peerState.setStatus('reconnecting');
    }

    const activeTransfers = await this.fetchActiveTransfers();
    const recoveredReceive = activeTransfers.find((item) => !item.complete && item.status !== 'cancelled');

    if (transferState.active?.direction === 'send' && (transferState.active.status === 'running' || transferState.active.status === 'paused')) {
      transferState.setActive(this.buildProgress({
        ...transferState.active,
        status: 'paused',
        speed: 0,
        etaSeconds: 0,
        errorCode: transferState.active.errorCode ?? 'app_restarted',
        errorMessage: transferState.active.errorMessage ?? 'App restarted. Resume is ready when you press Retry Missing Chunks.',
      }));
      if (transferState.queue.some((item) => item.path || item.file)) {
        toast('Recovered pending send session. You can resume it now.', { icon: '💾' });
      }
    }

    if (recoveredReceive) {
      this.applyRecoveredReceiveTransfer(recoveredReceive);
      toast('Recovered incoming transfer session from the local server.', { icon: '📥' });
      return;
    }

    if (transferState.active?.direction === 'receive') {
      transferState.setActive(this.buildProgress({
        ...transferState.active,
        status: 'paused',
        speed: 0,
        etaSeconds: 0,
        errorCode: transferState.active.errorCode ?? 'server_recovered',
        errorMessage: transferState.active.errorMessage ?? 'Receive session was restored. Waiting for sender to continue.',
      }));
      this.incomingTransfers.set(transferState.active.transferId, {
        filename: transferState.active.filename,
        filesize: transferState.active.totalBytes,
      });
      toast('Recovered receive session. Waiting for sender to continue.', { icon: '📥' });
    }
  }

  async ensureHostedRoom(mode: ConnectionMode): Promise<RoomData> {
    const { room, hosting } = this.roomStore;
    if (room && hosting && room.qr_data.mode === mode) {
      await this.attachLocalRoomSocket(room.room_id);
      return room;
    }
    return this.refreshHostedRoom(mode);
  }

  async refreshHostedRoom(mode: ConnectionMode): Promise<RoomData> {
    const room = await roomService.create('Desktop', 'windows', mode);
    useRoomStore.getState().setRoom(room);
    useRoomStore.getState().setHosting(true);
    useRoomStore.getState().saveRoom(room);
    usePeerStore.getState().setPeer(null);
    usePeerStore.getState().setStatus('disconnected');
    usePeerStore.getState().setMode(mode);
    await this.attachLocalRoomSocket(room.room_id);
    return room;
  }

  async connectFromInput(input: string): Promise<RoomData> {
    const roomData = this.parseInput(input);
    return this.connectToRoom(roomData);
  }

  async connectToRoom(roomData: RoomData): Promise<RoomData> {
    usePeerStore.getState().setStatus('connecting');
    const localDevice = await this.getLocalDevice();
    const mode = await this.manager.detectAndConnect(roomData, localDevice);
    useRoomStore.getState().setRoom(roomData);
    useRoomStore.getState().setHosting(false);
    useRoomStore.getState().saveRoom(roomData);
    await this.attachLocalRoomSocket(roomData.room_id);

    const peer: DeviceInfo = {
      device_name: roomData.qr_data.dn,
      device_type: roomData.qr_data.dt,
      ip: roomData.device_ip,
      port: roomData.device_port,
      os: roomData.qr_data.dt,
    };

    usePeerStore.getState().setPeer(peer);
    usePeerStore.getState().setMode(mode);
    usePeerStore.getState().setStatus('connected');
    void window.filebeam.notify.deviceConnected(peer.device_name);
    toast.success(`Connected to ${peer.device_name}`);
    return roomData;
  }

  async sendQueuedFiles(): Promise<void> {
    const { queue, removeFile, addHistory, setActive, resetSpeedSeries, pushSpeed } = useTransferStore.getState();
    const room = useRoomStore.getState().room;
    const hosting = useRoomStore.getState().hosting;
    const peer = usePeerStore.getState().peer;
    const mode = usePeerStore.getState().mode;

    if (!queue.length) {
      toast.error('Add at least one file first.');
      return;
    }
    if (!room) {
      toast.error('No active room.');
      return;
    }
    if (!peer && hosting) {
      toast.error('Wait for a peer to connect before sending.');
      return;
    }

    const sender = await this.getLocalDevice();
    const targetRoom: RoomData = hosting && peer ? {
      ...room,
      device_ip: peer.ip,
      device_port: peer.port,
      qr_data: {
        ...room.qr_data,
        ip: peer.ip,
        port: peer.port,
      },
    } : room;

    await this.manager.connectExplicit(targetRoom, mode);

    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];
      if (!item.file && !item.path) {
        toast.error(`Source file is missing for ${item.name}. Please re-add it.`);
        continue;
      }

      resetSpeedSeries();
      const startedAt = performance.now();
      setActive(this.buildProgress({
        transferId: item.id,
        filename: item.name,
        direction: 'send',
        totalBytes: item.size,
        transferredBytes: 0,
        speed: 0,
        etaSeconds: 0,
        progress: 0,
        fileIndex: index + 1,
        fileCount: queue.length,
        status: 'running',
      }));

      try {
        const result = await this.manager.sendFile(item, item.id, sender, ({
          bytesUploaded,
          totalBytes,
          speed,
          resumed,
          retryCount,
          missingChunks,
          duplicateChunks,
        }) => {
          const progress = totalBytes ? (bytesUploaded / totalBytes) * 100 : 0;
          const etaSeconds = speed > 0 ? Math.max(0, Math.round((totalBytes - bytesUploaded) / speed)) : 0;
          pushSpeed(speed / MB);
          usePeerStore.getState().setMetrics(usePeerStore.getState().mode === 'local' ? 2 : 24, speed / MB);
          setActive(this.buildProgress({
            transferId: item.id,
            filename: item.name,
            direction: 'send',
            totalBytes,
            transferredBytes: bytesUploaded,
            speed,
            etaSeconds,
            progress,
            fileIndex: index + 1,
            fileCount: queue.length,
            status: progress >= 100 ? 'complete' : 'running',
            missingChunks,
            duplicateChunks,
            retryCount,
            resumed,
          }));
        });

        const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.001);
        this.markSendComplete(item, peer?.device_name ?? room.qr_data.dn, elapsedSeconds, result);
        removeFile(item.id);
      } catch (error) {
        this.handleSendFailure(item, error, index + 1, queue.length);
        throw error;
      }
    }
  }

  disconnect(): void {
    this.manager.disconnect();
    this.localRoomWS?.close();
    this.localRoomWS = null;
    usePeerStore.getState().setPeer(null);
    usePeerStore.getState().setStatus('disconnected');
  }

  private markSendComplete(item: { id: string; name: string; size: number }, peerName: string, elapsedSeconds: number, result: SendTransferResult): void {
    const { addHistory, setActive } = useTransferStore.getState();
    setActive(this.buildProgress({
      transferId: item.id,
      filename: item.name,
      direction: 'send',
      totalBytes: item.size,
      transferredBytes: item.size,
      speed: item.size / elapsedSeconds,
      etaSeconds: 0,
      progress: 100,
      status: 'complete',
      resumed: result.resumed,
      retryCount: result.retryCount,
      duplicateChunks: result.duplicateChunks,
      missingChunks: [],
    }));
    addHistory({
      id: item.id,
      filename: item.name,
      size: item.size,
      direction: 'send',
      speedMBps: (item.size / elapsedSeconds) / MB,
      peerName,
      createdAt: new Date().toISOString(),
    });
    toast.success(`Sent ${item.name}${result.resumed ? ' (resumed)' : ''}`);
  }

  private handleSendFailure(item: { id: string; name: string; size: number }, error: unknown, fileIndex: number, fileCount: number): void {
    const { setActive, active } = useTransferStore.getState();
    const current = active?.transferId === item.id ? active : null;

    if (error instanceof TransferDiskFullError) {
      setActive(this.buildProgress({
        transferId: item.id,
        filename: item.name,
        direction: 'send',
        totalBytes: item.size,
        transferredBytes: current?.transferredBytes ?? 0,
        speed: 0,
        etaSeconds: 0,
        progress: current?.progress ?? 0,
        fileIndex,
        fileCount,
        status: 'paused',
        errorCode: 'disk_full',
        errorMessage: error.message,
        missingChunks: current?.missingChunks,
        duplicateChunks: current?.duplicateChunks,
        retryCount: current?.retryCount,
        resumed: current?.resumed,
      }));
      toast.error(error.message);
      return;
    }

    if (error instanceof TransferResumeRequiredError) {
      const transferredBytes = Math.max(0, item.size - error.missingChunks.reduce((sum, chunkIndex) => {
        const chunkSize = 10 * MB;
        const start = chunkIndex * chunkSize;
        const end = Math.min(start + chunkSize, item.size);
        return sum + Math.max(0, end - start);
      }, 0));
      const progress = item.size ? (transferredBytes / item.size) * 100 : 0;
      setActive(this.buildProgress({
        transferId: item.id,
        filename: item.name,
        direction: 'send',
        totalBytes: item.size,
        transferredBytes,
        speed: 0,
        etaSeconds: 0,
        progress,
        fileIndex,
        fileCount,
        status: 'paused',
        errorCode: 'resume_required',
        errorMessage: error.message,
        missingChunks: error.missingChunks,
        retryCount: error.retryCount,
        duplicateChunks: error.duplicateChunks,
        resumed: true,
      }));
      toast(error.message, { icon: '⏸️' });
      return;
    }

    const message = error instanceof Error ? error.message : 'Transfer failed';
    setActive(this.buildProgress({
      transferId: item.id,
      filename: item.name,
      direction: 'send',
      totalBytes: item.size,
      transferredBytes: current?.transferredBytes ?? 0,
      speed: 0,
      etaSeconds: 0,
      progress: current?.progress ?? 0,
      fileIndex,
      fileCount,
      status: 'error',
      errorCode: 'send_failed',
      errorMessage: message,
      missingChunks: current?.missingChunks,
      duplicateChunks: current?.duplicateChunks,
      retryCount: current?.retryCount,
      resumed: current?.resumed,
    }));
    toast.error(message);
  }

  private async attachLocalRoomSocket(roomId: string): Promise<void> {
    const port = (await window.filebeam.server.getPort()) ?? 8765;
    const url = `ws://127.0.0.1:${port}/ws/room/${roomId}`;
    if (this.localRoomWS?.url === url && this.localRoomWS.readyState <= WebSocket.OPEN) {
      return;
    }
    this.localRoomWS?.close();
    this.localRoomWS = new WebSocket(url);
    this.localRoomWS.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as RoomSocketMessage;
        void this.handleRoomEvent(message);
      } catch {
        // ignore malformed local websocket messages
      }
    };
  }

  private async handleRoomEvent(message: RoomSocketMessage): Promise<void> {
    const setPeer = usePeerStore.getState().setPeer;
    const setStatus = usePeerStore.getState().setStatus;
    const setActive = useTransferStore.getState().setActive;
    const addHistory = useTransferStore.getState().addHistory;
    const pushSpeed = useTransferStore.getState().pushSpeed;

    if (message.type === 'peer_joined') {
      const peer: DeviceInfo = {
        device_name: String(message.device_name ?? 'Peer Device'),
        device_type: String(message.device_type ?? 'unknown'),
        ip: String(message.ip ?? '0.0.0.0'),
        port: Number(message.port ?? 8765),
        os: String(message.os ?? message.device_type ?? 'unknown'),
      };
      setPeer(peer);
      setStatus('connected');
      void window.filebeam.notify.deviceConnected(peer.device_name);
      return;
    }

    if (message.type === 'peer_left') {
      setPeer(null);
      setStatus('disconnected');
      return;
    }

    if (message.type === 'transfer_incoming') {
      const transferId = String(message.transfer_id ?? crypto.randomUUID());
      const filename = String(message.filename ?? 'Incoming file');
      const filesize = Number(message.filesize ?? 0);
      this.incomingTransfers.set(transferId, { filename, filesize });
      setActive(this.buildProgress({
        transferId,
        filename,
        direction: 'receive',
        totalBytes: filesize,
        transferredBytes: 0,
        speed: 0,
        etaSeconds: 0,
        progress: 0,
        status: 'running',
      }));
      void window.filebeam.notify.transferRequest(filename);
      return;
    }

    if (message.type === 'chunk_received') {
      const transferId = String(message.transfer_id ?? '');
      const meta = this.incomingTransfers.get(transferId);
      const current = useTransferStore.getState().active;
      if (!meta || !current || current.transferId !== transferId) {
        return;
      }
      const progress = Number(message.progress_pct ?? current.progress);
      const transferredBytes = Math.round(meta.filesize * (progress / 100));
      const previousBytes = current.transferredBytes;
      const deltaBytes = Math.max(0, transferredBytes - previousBytes);
      const approxSpeed = Math.max(current.speed, deltaBytes * 2);
      pushSpeed(approxSpeed / MB);
      setActive(this.buildProgress({
        ...current,
        transferredBytes,
        progress,
        speed: approxSpeed,
        etaSeconds: approxSpeed > 0 ? Math.max(0, Math.round((meta.filesize - transferredBytes) / approxSpeed)) : 0,
        status: progress >= 100 ? 'complete' : 'running',
        errorCode: undefined,
        errorMessage: undefined,
      }));
      return;
    }

    if (message.type === 'transfer_complete') {
      const transferId = String(message.transfer_id ?? '');
      const meta = this.incomingTransfers.get(transferId);
      const current = useTransferStore.getState().active;
      if (current && current.transferId === transferId) {
        setActive(this.buildProgress({
          ...current,
          transferredBytes: current.totalBytes,
          progress: 100,
          status: 'complete',
          savePath: String(message.save_path ?? current.savePath ?? ''),
          errorCode: undefined,
          errorMessage: undefined,
          missingChunks: [],
        }));
      }
      addHistory({
        id: transferId || crypto.randomUUID(),
        filename: meta?.filename ?? String(message.filename ?? 'Incoming file'),
        size: meta?.filesize ?? 0,
        direction: 'receive',
        speedMBps: Number(message.avg_speed_mbps ?? 0),
        peerName: usePeerStore.getState().peer?.device_name ?? 'Connected device',
        createdAt: new Date().toISOString(),
        path: String(message.save_path ?? ''),
      });
      if (message.save_path) {
        void window.filebeam.notify.transferComplete('FileBeam', `Received ${String(message.filename ?? meta?.filename ?? 'file')}`);
      }
      return;
    }

    if (message.type === 'transfer_error') {
      const current = useTransferStore.getState().active;
      const transferId = String(message.transfer_id ?? '');
      if (current && current.transferId === transferId) {
        setActive(this.buildProgress({
          ...current,
          status: 'paused',
          errorCode: String(message.error_code ?? 'transfer_error'),
          errorMessage: String(message.message ?? 'Transfer paused due to an error.'),
        }));
      }
      return;
    }

    if (message.type === 'transfer_cancelled') {
      const current = useTransferStore.getState().active;
      if (current && current.transferId === String(message.transfer_id ?? '')) {
        setActive(this.buildProgress({ ...current, status: 'cancelled' }));
      }
    }
  }
}

export const desktopRuntime = new DesktopRuntime();
