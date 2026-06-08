import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import type { TransferProgressModel } from '@/types';

interface Props {
  progress: TransferProgressModel;
  onCancel(): void;
  onOpenLocation?(): void;
}

const statusStyles: Record<TransferProgressModel['status'], string> = {
  idle: 'bg-white/10 text-white/70',
  running: 'bg-accent/15 text-accent',
  paused: 'bg-warning/15 text-warning',
  complete: 'bg-success/15 text-success',
  error: 'bg-danger/15 text-danger',
  cancelled: 'bg-white/10 text-white/50',
};

export function TransferProgress({ progress, onCancel, onOpenLocation }: Props): JSX.Element {
  const circumference = 2 * Math.PI * 88;
  const dashoffset = circumference - (progress.progress / 100) * circumference;

  useEffect(() => {
    if (progress.status === 'complete') {
      confetti({ particleCount: 120, spread: 70, colors: ['#6C63FF', '#FF6584', '#43CFFF', '#00D4AA'] });
    }
  }, [progress.status]);

  return (
    <div className="grid gap-6 rounded-3xl border border-white/10 bg-white/5 p-6 text-white shadow-glass md:grid-cols-[220px_1fr]">
      <div className="flex items-center justify-center">
        <svg width="200" height="200" viewBox="0 0 200 200">
          <defs>
            <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6C63FF" />
              <stop offset="100%" stopColor="#43CFFF" />
            </linearGradient>
          </defs>
          <circle cx="100" cy="100" r="88" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12" />
          <circle
            cx="100"
            cy="100"
            r="88"
            fill="none"
            stroke="url(#ring)"
            strokeWidth="12"
            strokeDasharray={circumference}
            strokeDashoffset={dashoffset}
            strokeLinecap="round"
            transform="rotate(-90 100 100)"
            style={{ filter: 'drop-shadow(0 0 10px #6C63FF)', transition: 'stroke-dashoffset 0.3s ease' }}
          />
          <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fill="#fff" fontSize="28" fontWeight="700">
            {Math.round(progress.progress)}%
          </text>
        </svg>
      </div>

      <div className="flex flex-col justify-center gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-xl font-semibold">{progress.filename}</div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${statusStyles[progress.status]}`}>{progress.status}</span>
          {progress.resumed ? <span className="rounded-full bg-primary/15 px-3 py-1 text-xs text-primary">Resumed</span> : null}
        </div>

        <div className="text-sm text-white/60">{progress.direction === 'send' ? '↑ Sending' : '↓ Receiving'}</div>
        <div className="font-mono text-3xl text-success">{(progress.speed / 1024 / 1024).toFixed(1)} MB/s</div>
        <div className="font-mono text-sm text-white/60">ETA {new Date(progress.etaSeconds * 1000).toISOString().slice(14, 19)}</div>
        <div className="text-sm text-white/50">{(progress.transferredBytes / 1024 / 1024).toFixed(1)} MB / {(progress.totalBytes / 1024 / 1024).toFixed(1)} MB</div>

        {typeof progress.fileIndex === 'number' && typeof progress.fileCount === 'number' ? (
          <div className="text-sm text-white/50">File {progress.fileIndex} of {progress.fileCount}</div>
        ) : null}

        {progress.errorMessage ? <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">{progress.errorMessage}</div> : null}
        {progress.missingChunks?.length ? <div className="text-sm text-warning">Missing chunks: {progress.missingChunks.length}</div> : null}
        {typeof progress.retryCount === 'number' && progress.retryCount > 0 ? <div className="text-sm text-white/50">Retry rounds: {progress.retryCount}</div> : null}
        {typeof progress.duplicateChunks === 'number' && progress.duplicateChunks > 0 ? <div className="text-sm text-white/50">Duplicate chunks skipped: {progress.duplicateChunks}</div> : null}

        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-[linear-gradient(90deg,#6C63FF,#43CFFF,#6C63FF)] bg-[length:200%_100%] animate-shimmer" style={{ width: `${progress.progress}%` }} />
        </div>

        <div className="flex gap-2 pt-2">
          {progress.status === 'complete' && onOpenLocation ? <button className="rounded-xl bg-success/20 px-4 py-2 text-success" onClick={onOpenLocation}>Open File Location</button> : null}
          {progress.status === 'running' ? <button className="rounded-xl bg-danger/20 px-4 py-2 text-danger" onClick={onCancel}>Cancel</button> : null}
        </div>
      </div>
    </div>
  );
}
