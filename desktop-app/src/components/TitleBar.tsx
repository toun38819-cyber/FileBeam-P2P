import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { Activity, Minus, RefreshCw, Square, X } from 'lucide-react';
import { useServerStore } from '@/stores/serverStore';

interface Props {
  title: string;
  mode: 'local' | 'webrtc';
  serverRunning: boolean;
}

const dragStyle: CSSProperties = { WebkitAppRegion: 'drag' as CSSProperties['WebkitAppRegion'] };
const noDragStyle: CSSProperties = { WebkitAppRegion: 'no-drag' as CSSProperties['WebkitAppRegion'] };

const serverStatusText = {
  starting: 'Starting',
  running: 'Online',
  reconnecting: 'Reconnecting',
  offline: 'Offline',
  recovered: 'Recovered',
} as const;

export function TitleBar({ title, mode, serverRunning }: Props): JSX.Element {
  const { status, port, activeTransfers, pausedTransfers } = useServerStore((state) => ({
    status: state.status,
    port: state.port,
    activeTransfers: state.activeTransfers,
    pausedTransfers: state.pausedTransfers,
  }));

  return (
    <div className="flex h-10 items-center justify-between border-b border-white/10 bg-white/5 px-3 text-white backdrop-blur-md" style={dragStyle}>
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-primary to-accent" />
        <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text font-semibold text-transparent">FileBeam</span>
      </div>
      <motion.div key={title} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-sm text-white/70">
        {title}
      </motion.div>
      <div className="flex items-center gap-2" style={noDragStyle}>
        <div className={`flex items-center gap-2 rounded-full px-2 py-1 text-xs ${serverRunning ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${serverRunning ? 'bg-success' : 'bg-danger'}`} />
          <span>Server {serverStatusText[status]}</span>
          <span className="font-mono opacity-80">:{port ?? '—'}</span>
        </div>
        <div className="hidden items-center gap-1 rounded-full bg-white/5 px-2 py-1 text-xs text-white/70 md:flex">
          <Activity size={12} />
          <span>{activeTransfers} active</span>
          {pausedTransfers > 0 ? <span>• {pausedTransfers} paused</span> : null}
        </div>
        <span className={`rounded-full px-2 py-1 text-xs ${mode === 'local' ? 'bg-success/15 text-success' : 'bg-accent/15 text-accent'}`}>
          {mode === 'local' ? '🟢 Local' : '🔵 Internet P2P'}
        </span>
        {status === 'reconnecting' ? <RefreshCw size={14} className="animate-spin text-warning" /> : null}
        <button className="rounded p-2 hover:bg-white/10" onClick={() => void window.filebeam.window.minimize()}><Minus size={14} /></button>
        <button className="rounded p-2 hover:bg-white/10" onClick={() => void window.filebeam.window.maximize()}><Square size={14} /></button>
        <button className="rounded p-2 hover:bg-danger/20 hover:text-danger" onClick={() => void window.filebeam.window.close()}><X size={14} /></button>
      </div>
    </div>
  );
}
