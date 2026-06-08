import { useMemo } from 'react';
import toast from 'react-hot-toast';
import { DropZone } from '@/components/DropZone';
import { FileList } from '@/components/FileList';
import { SpeedGraph } from '@/components/SpeedGraph';
import { TransferProgress } from '@/components/TransferProgress';
import { createTransferItemsFromPaths, toTransferItems } from '@/services/fileChunker';
import { desktopRuntime } from '@/services/p2p/DesktopRuntime';
import { useTransferStore } from '@/stores/transferStore';

export default function Send(): JSX.Element {
  const { queue, addFiles, removeFile, clearQueue, active, setActive, speedSeries } = useTransferStore();
  const totalSize = useMemo(() => queue.reduce((sum, item) => sum + item.size, 0), [queue]);

  const sendAll = (): void => {
    void desktopRuntime.sendQueuedFiles().catch((error: unknown) => {
      if (!(error instanceof Error)) {
        toast.error('Transfer failed');
      }
    });
  };

  const browseFiles = async (): Promise<void> => {
    const paths = await window.filebeam.fs.openFileDialog();
    if (!paths.length) {
      return;
    }
    const items = await createTransferItemsFromPaths(paths);
    addFiles(items);
  };

  const activeTransfer = active;
  const showQueue = !activeTransfer || activeTransfer.status === 'idle' || activeTransfer.status === 'cancelled';
  const canRetry = Boolean(activeTransfer && (activeTransfer.status === 'paused' || activeTransfer.status === 'error'));

  return (
    <div className="space-y-6">
      {showQueue || !activeTransfer ? (
        <>
          <DropZone onFiles={(files) => addFiles(toTransferItems(files))} onBrowse={browseFiles} />
          <FileList items={queue} onRemove={removeFile} onClear={clearQueue} />
          <div className="sticky bottom-0 flex items-center justify-between rounded-3xl border border-white/10 bg-[#101224]/90 px-6 py-4 text-white backdrop-blur">
            <div>{queue.length} files • {(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB</div>
            <div>🗜 Compression: Auto</div>
            <button className="rounded-2xl bg-gradient-to-r from-primary to-accent px-5 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-50" onClick={sendAll} disabled={!queue.length}>Send All →</button>
          </div>
        </>
      ) : (
        <>
          <TransferProgress progress={activeTransfer} onCancel={() => setActive({ ...activeTransfer, status: 'cancelled' })} />
          <SpeedGraph data={speedSeries} />
          {canRetry ? (
            <div className="flex gap-3">
              <button className="rounded-2xl bg-gradient-to-r from-primary to-accent px-5 py-3 font-semibold" onClick={sendAll}>Retry Missing Chunks</button>
              <button className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-white/70" onClick={() => setActive({ ...activeTransfer, status: 'cancelled' })}>Dismiss</button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
