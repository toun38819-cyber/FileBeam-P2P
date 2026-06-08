import { Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { usePeerStore } from '@/stores/peerStore';
import { useServerStore } from '@/stores/serverStore';

interface Props {
  onScan(): void;
}

const badgeStyles = {
  disconnected: 'border-white/10 bg-white/5 text-white',
  connecting: 'border-warning/20 bg-warning/10 text-warning',
  connected: 'border-success/20 bg-success/10 text-success',
  reconnecting: 'border-warning/20 bg-warning/10 text-warning',
  recovered: 'border-accent/20 bg-accent/10 text-accent',
} as const;

export function PeerStatus({ onScan }: Props): JSX.Element {
  const { peer, status, mode, ping, speedMBps } = usePeerStore();
  const serverStatus = useServerStore((state) => state.status);

  if (status === 'connecting') {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-warning">
        <Loader2 className="animate-spin" size={16} />
        Connecting to peer…
      </div>
    );
  }

  if (status === 'reconnecting') {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-warning">
        <RefreshCw className="animate-spin" size={16} />
        <span>{peer?.device_name ?? 'Peer'} • reconnecting after local server interruption…</span>
      </div>
    );
  }

  if (status === 'recovered' && peer) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-accent">
        <RefreshCw size={16} />
        <span>{peer.device_name} • session recovered • {mode === 'local' ? `WiFi • ${ping}ms` : 'Internet P2P'}</span>
      </div>
    );
  }

  if (status === 'connected' && peer) {
    return (
      <div className={`rounded-2xl border px-4 py-3 ${badgeStyles.connected}`}>
        {peer.device_name} • {mode === 'local' ? `WiFi • ${ping}ms • ${speedMBps.toFixed(1)} MB/s` : `Internet P2P • ${ping}ms`}
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 ${serverStatus === 'reconnecting' ? badgeStyles.reconnecting : badgeStyles.disconnected}`}>
      {serverStatus === 'reconnecting' ? <RefreshCw className="animate-spin" size={16} /> : <WifiOff size={16} />}
      <span>{serverStatus === 'reconnecting' ? 'Connection temporarily unavailable — reattaching session…' : 'Not connected — waiting for device'}</span>
      <button className="rounded-xl bg-white/10 px-3 py-2 text-sm" onClick={onScan}>Scan QR</button>
      <button className="rounded-xl bg-white/10 px-3 py-2 text-sm">Enter Code</button>
    </div>
  );
}
