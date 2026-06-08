import { SpeedGraph } from '@/components/SpeedGraph';
import { TransferProgress } from '@/components/TransferProgress';
import { useTransferStore } from '@/stores/transferStore';

export default function Transfer(): JSX.Element {
  const { active, setActive, speedSeries } = useTransferStore();
  const activeTransfer = active;

  if (!activeTransfer) {
    return <div className="grid min-h-[70vh] place-items-center rounded-3xl border border-white/10 bg-white/5 text-white">No active transfer.</div>;
  }

  return (
    <div className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-8 text-white shadow-glass">
      <div className="text-sm text-white/60">{activeTransfer.direction === 'send' ? 'Sending to connected device' : 'Receiving from connected device'}</div>
      <TransferProgress progress={activeTransfer} onCancel={() => setActive({ ...activeTransfer, status: 'cancelled' })} onOpenLocation={activeTransfer.savePath ? () => void window.filebeam.fs.showInExplorer(activeTransfer.savePath as string) : undefined} />
      <div className="mx-auto max-w-xl">
        <SpeedGraph data={speedSeries} />
      </div>
    </div>
  );
}
