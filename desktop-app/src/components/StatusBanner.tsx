import { AlertCircle, CheckCircle2, Info, RefreshCw, X } from 'lucide-react';
import { useServerStore } from '@/stores/serverStore';

const toneStyles = {
  info: 'border-accent/30 bg-accent/10 text-accent',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  error: 'border-danger/30 bg-danger/10 text-danger',
} as const;

const toneIcons = {
  info: Info,
  success: CheckCircle2,
  warning: RefreshCw,
  error: AlertCircle,
} as const;

export function StatusBanner(): JSX.Element | null {
  const banner = useServerStore((state) => state.banner);
  const clearBanner = useServerStore((state) => state.clearBanner);

  if (!banner) {
    return null;
  }

  const Icon = toneIcons[banner.tone];

  return (
    <div className={`flex items-center justify-between gap-4 border-b px-4 py-3 text-sm ${toneStyles[banner.tone]}`}>
      <div className="flex items-start gap-3">
        <Icon size={18} className={banner.tone === 'warning' ? 'animate-spin' : ''} />
        <div>
          <div className="font-semibold">{banner.title}</div>
          <div className="opacity-90">{banner.message}</div>
        </div>
      </div>
      <button className="rounded-lg p-1 hover:bg-white/10" onClick={clearBanner}>
        <X size={16} />
      </button>
    </div>
  );
}
