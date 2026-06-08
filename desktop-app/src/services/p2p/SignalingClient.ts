export interface SignalingMessage { type: 'offer' | 'answer' | 'ice_candidate' | 'ready' | 'bye' | 'peer_joined' | 'peer_left' | 'pong'; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit; }
export class SignalingClient {
  private ws: WebSocket | null = null;
  constructor(private readonly signalingURL: string, private readonly roomId: string, private readonly onMessage: (message: SignalingMessage) => void) {}
  async connect(): Promise<void> { this.ws = new WebSocket(`${this.signalingURL.replace(/\/$/, '')}/signal/${this.roomId}`); await new Promise<void>((resolve, reject) => { if (!this.ws) return reject(new Error('WebSocket unavailable')); this.ws.onopen = () => resolve(); this.ws.onerror = () => reject(new Error('Failed to connect to signaling server')); this.ws.onmessage = (event) => this.onMessage(JSON.parse(event.data) as SignalingMessage); }); }
  send(message: SignalingMessage): void { this.ws?.send(JSON.stringify(message)); }
  disconnectAfterDelay(ms = 5000): void { window.setTimeout(() => this.ws?.close(), ms); }
}
