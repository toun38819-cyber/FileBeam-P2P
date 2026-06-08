import { api } from './api';
import type { DeviceInfo, RoomData } from '@/types';

export const roomService = {
  create(device_name: string, device_type: string, transfer_mode: 'local' | 'webrtc'): Promise<RoomData> {
    return api.post('/room/create', { device_name, device_type, transfer_mode });
  },
  importRoom(room_id: string, encryption_key: string, transfer_mode: 'local' | 'webrtc', host_device: DeviceInfo, local_device: DeviceInfo): Promise<RoomData> {
    return api.post('/room/import', { room_id, encryption_key, transfer_mode, host_device, local_device });
  },
  join(room_id: string, device_name: string, device_type: string, joiner_ip: string, joiner_port: number): Promise<unknown> {
    return api.post('/room/join', { room_id, device_name, device_type, joiner_ip, joiner_port });
  },
  status(room_id: string): Promise<unknown> {
    return api.get(`/room/${room_id}/status`);
  },
};
