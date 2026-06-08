import { useState } from 'react';
import { SpeedGraph } from '@/components/SpeedGraph';
import { TransferProgress } from '@/components/TransferProgress';
import { useTransferStore } from '@/stores/transferStore';

export default function Receive(): JSX.Element {
  const { active, speedSeries, setActive } = useTransferStore();
  const [autoAccept, setAutoAccept] = useState(false);
  const [autoOpen, setAutoOpen] = useState(true);
  const activeTransfer = active && active.direction === 'receive' ? active : null;

  if (activeTransfer) {
    return (
      <div className="space-y-6">
        <TransferProgress progress={activeTransfer} onCancel={() => setActive({ ...activeTransfer, status: 'cancelled' })} onOpenLocation={activeTransfer.savePath ? () => void window.filebeam.fs.showInExplorer(activeTransfer.savePath as string) : undefined} />
        <SpeedGraph data={speedSeries} />
      </div>
    );
  }

  return (
    <div className="grid min-h-[70vh] place-items-center rounded-3xl border border-white/10 bg-white/5 p-8 text-white shadow-glass">
      <div className="w-full max-w-xl text-center">
        <div className="mx-auto mb-6 h-40 w-40 rounded-full border border-primary/30 bg-[radial-gradient(circle,rgba(108,99,255,0.25),transparent_60%)]" />
        <div className="text-3xl font-semibold">Waiting for incoming files…</div>
        <div className="mt-3 text-white/60">Save to: C:\Users\...\Downloads\FileBeam</div>
        <div className="mt-6 flex flex-col gap-3 text-left text-sm">
          <label className="flex items-center gap-3"><input checked={autoAccept} onChange={() => setAutoAccept((value) => !value)} type="checkbox" /> Auto-accept from connected device</label>
          <label className="flex items-center gap-3"><input checked={autoOpen} onChange={() => setAutoOpen((value) => !value)} type="checkbox" /> Open folder when transfer complete</label>
        </div>
      </div>
    </div>
  );
}
