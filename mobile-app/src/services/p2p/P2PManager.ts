import type { ConnectionMode, RoomData } from '../../types';
import { LocalP2PService } from './LocalP2PService';
import { WebRTCService } from './WebRTCService';
export class P2PManager { private mode: ConnectionMode = 'local'; private readonly local = new LocalP2PService(); private readonly webrtc = new WebRTCService(); async connect(room: RoomData, mode: ConnectionMode): Promise<void> { this.mode = mode; if (mode === 'local') await this.local.connect(room); else await this.webrtc.connect(room.room_id, String(room.qr_data.sig ?? 'wss://signal.filebeam.app')); } }
