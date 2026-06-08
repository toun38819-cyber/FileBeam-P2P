import axios from 'axios';
import type { RoomData } from '../../types';
export class LocalP2PService { async connect(room: RoomData): Promise<void> { await axios.post(`http://${room.device_ip}:${room.device_port}/room/join`, { room_id: room.room_id, device_name: 'Phone', device_type: 'android', joiner_ip: '0.0.0.0' }); } }
