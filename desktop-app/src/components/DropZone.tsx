import { FolderOpen } from 'lucide-react';
import { useDropzone } from 'react-dropzone';

interface Props {
  onFiles(files: File[]): void;
  onBrowse?(): void;
}

export function DropZone({ onFiles, onBrowse }: Props): JSX.Element {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => onFiles(acceptedFiles),
  });

  return (
    <div {...getRootProps()} className={`flex h-[280px] cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed p-6 text-white transition ${isDragActive ? 'scale-[1.02] border-primary bg-primary/10 shadow-[0_0_40px_rgba(108,99,255,0.4)]' : 'border-primary/40 bg-white/5'}`}>
      <input {...getInputProps()} />
      <FolderOpen size={44} className={isDragActive ? 'text-primary' : 'text-white/70'} />
      <div className="mt-4 text-xl font-semibold">Drop files or folders here</div>
      <div className="mt-1 text-sm text-white/60">or Browse</div>
      {onBrowse ? (
        <button
          type="button"
          className="mt-4 rounded-2xl bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
          onClick={(event) => {
            event.stopPropagation();
            void onBrowse();
          }}
        >
          Browse Files
        </button>
      ) : null}
    </div>
  );
}
