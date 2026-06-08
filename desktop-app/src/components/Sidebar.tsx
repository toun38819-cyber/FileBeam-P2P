import { NavLink } from 'react-router-dom';
import { Activity, Home, History, Inbox, RefreshCw, Send, Settings, Unplug, WifiOff } from 'lucide-react';
import { desktopRuntime } from '@/services/p2p/DesktopRuntime';
import { usePeerStore } from '@/stores/peerStore';
import { useRoomStore } from '@/stores/roomStore';
import { useServerStore } from '@/stores/serverStore';
import { ServerStatus } from './ServerStatus';

const navItems = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/send', label: 'Send', icon: Send },
  { to: '/receive', label: 'Receive', icon: Inbox },
  { to: '/history', label: 'History', icon: History },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const connectionBadgeStyles = {
  disconnected: 'bg-white/10 text-white/70',
  connecting: 'bg-warning/15 text-warning',
  connected: 'bg-success/15 text-success',
  reconnecting: 'bg-warning/15 text-warning',
  recovered: 'bg-accent/15 text-accent',
} as const;

const connectionLabels = {
  disconnected: 'Disconnected',
  connecting: 'Connecting',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  recovered: 'Recovered',
} as const;

export function Sidebar(): JSX.Element {
  const { peer, mode, speedMBps, status, ping } = usePeerStore();
  const { room } = useRoomStore();
  const { activeTransfers } = useServerStore((state) => ({ activeTransfers: state.activeTransfers }));

  return (
    <aside className="flex h-full w-[260px] flex-col border-r border-white/10 bg-white/5 p-4 backdrop-blur-xl">
      <div className="mb-6 rounded-2xl border border-white/10 bg-gradient-to-br from-primary/15 to-accent/10 p-4 shadow-glass">
        <div className="text-lg font-semibold text-white">Direct transfer. No servers. Full speed.</div>
        <div className="mt-1 text-sm text-white/60">Serverless P2P for LAN and internet.</div>
      </div>

      <nav className="space-y-2">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `flex items-center gap-3 rounded-2xl px-4 py-3 transition ${isActive ? 'bg-primary/20 text-white' : 'text-white/65 hover:bg-white/5 hover:text-white'}`}>
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-white/60">Connection</span>
            <span className={`rounded-full px-2 py-1 text-xs ${connectionBadgeStyles[status]}`}>{connectionLabels[status]}</span>
          </div>

          <div className="text-sm font-medium text-white">{peer?.device_name ?? 'Waiting for peer'}</div>
          <div className="mt-1 text-xs text-white/50">{mode === 'local' ? 'Local WiFi / LAN' : 'Internet P2P'}</div>

          <div className="mt-3 flex items-center gap-2 text-sm">
            {status === 'reconnecting' ? <RefreshCw size={14} className="animate-spin text-warning" /> : status === 'disconnected' ? <WifiOff size={14} className="text-white/50" /> : <Activity size={14} className="text-success" />}
            <span className={status === 'reconnecting' ? 'text-warning' : 'text-white/70'}>
              {status === 'connected' ? `${speedMBps.toFixed(1)} MB/s • ${ping}ms` : status === 'recovered' ? 'Session reattached' : status === 'reconnecting' ? 'Recovering link…' : 'No active peer link'}
            </span>
          </div>

          <div className="mt-2 text-xs text-white/50">{activeTransfers} active local transfer{activeTransfers === 1 ? '' : 's'}</div>

          <button className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-white/75 hover:bg-white/10" onClick={() => desktopRuntime.disconnect()}>
            <Unplug size={14} /> Disconnect
          </button>
        </div>

        <ServerStatus roomId={room?.room_id ?? '—'} />
      </div>
    </aside>
  );
}
