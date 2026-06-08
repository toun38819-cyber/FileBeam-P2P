import { useMemo } from 'react';
import { RefreshCw, ServerCrash } from 'lucide-react';
import { desktopRuntime } from '@/services/p2p/DesktopRuntime';
import { useServerStore } from '@/stores/serverStore';

interface Props {
  roomId: string;
}

const statusText = {
  starting: 'Starting',
  running: 'Online',
  reconnecting: 'Reconnecting',
  offline: 'Offline',
  recovered: 'Recovered',
} as const;

const statusClasses = {
  starting: 'bg-white/10 text-white/70',
  running: 'bg-success/15 text-success',
  reconnecting: 'bg-warning/15 text-warning',
  offline: 'bg-danger/15 text-danger',
  recovered: 'bg-accent/15 text-accent',
} as const;

export function ServerStatus({ roomId }: Props): JSX.Element {
  const { running, status, port, activeTransfers, pausedTransfers, lastRecoveryAt } = useServerStore((state) => ({
    running: state.running,
    status: state.status,
    port: state.port,
    activeTransfers: state.activeTransfers,
    pausedTransfers: state.pausedTransfers,
    lastRecoveryAt: state.lastRecoveryAt,
  }));

  const recoveredAt = useMemo(() => (lastRecoveryAt ? new Date(lastRecoveryAt).toLocaleTimeString() : null), [lastRecoveryAt]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${running ? 'bg-success' : status === 'reconnecting' ? 'bg-warning' : 'bg-danger'}`} />
          <span className="font-medium text-white">Server</span>
          <span className={`rounded-full px-2 py-1 text-xs ${statusClasses[status]}`}>{statusText[status]}</span>
        </div>
        <span className="font-mono text-xs">:{port ?? '—'}</span>
      </div>

      <div className="mt-2 font-mono text-xs">Room: {roomId}</div>
      <div className="mt-2 text-xs text-white/50">Transfers: {activeTransfers} active{pausedTransfers > 0 ? ` • ${pausedTransfers} paused` : ''}</div>
      {recoveredAt ? <div className="mt-1 text-xs text-white/40">Recovered at {recoveredAt}</div> : null}

      {!running || status === 'reconnecting' ? (
        <button
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
          onClick={() => void desktopRuntime.restartLocalServer()}
        >
          {status === 'reconnecting' ? <RefreshCw size={14} className="animate-spin" /> : <ServerCrash size={14} />}
          {status === 'reconnecting' ? 'Reattach Session' : 'Restart Server'}
        </button>
      ) : null}
    </div>
  );
}
