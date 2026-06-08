export type ConnectionMode = 'local' | 'webrtc';
export interface DeviceInfo { device_name: string; device_type: string; ip: string; port: number; }
export interface RoomData { room_id: string; room_code: string; device_ip: string; device_port: number; encryption_key: string; qr_data: Record<string, unknown>; qr_image_base64?: string; expires_at?: string; }
export interface TransferProgressModel { transferId: string; filename: string; totalBytes: number; transferredBytes: number; speed: number; progress: number; direction: 'send' | 'receive'; status: 'idle' | 'running' | 'complete'; }
