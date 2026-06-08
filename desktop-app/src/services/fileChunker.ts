import type { TransferItem } from '@/types';

interface ElectronFile extends File {
  path?: string;
}

interface FileMetadataRecord {
  path: string;
  name: string;
  size: number;
  type: string;
}

const base64ToUint8Array = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

export const toTransferItems = (files: File[]): TransferItem[] => {
  return files.map((file) => {
    const electronFile = file as ElectronFile;
    return {
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      file,
      path: electronFile.path,
      persistable: Boolean(electronFile.path),
    };
  });
};

export const createTransferItemsFromPaths = async (paths: string[]): Promise<TransferItem[]> => {
  const metadata = await window.filebeam.fs.getFileMetadata(paths) as FileMetadataRecord[];
  return metadata.map((item) => ({
    id: crypto.randomUUID(),
    name: item.name,
    size: item.size,
    type: item.type || 'application/octet-stream',
    path: item.path,
    persistable: true,
  }));
};

export const sha256Buffer = async (buffer: ArrayBuffer): Promise<string> => {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash)).map((value) => value.toString(16).padStart(2, '0')).join('');
};

export const sha256File = async (file: File): Promise<string> => sha256Buffer(await file.arrayBuffer());

export const sha256TransferItem = async (item: TransferItem): Promise<string> => {
  if (item.path) {
    return window.filebeam.fs.sha256File(item.path);
  }
  if (item.file) {
    return sha256File(item.file);
  }
  throw new Error(`No source available for ${item.name}`);
};

export const readTransferItemChunk = async (item: TransferItem, start: number, end: number): Promise<ArrayBuffer> => {
  if (item.file) {
    return item.file.slice(start, end).arrayBuffer();
  }
  if (item.path) {
    const base64 = await window.filebeam.fs.readFileChunk(item.path, start, Math.max(0, end - start));
    return base64ToUint8Array(base64).buffer;
  }
  throw new Error(`No source available for ${item.name}`);
};

export const encryptChunk = async (data: Uint8Array, keyHex: string, chunkIndex: number): Promise<Uint8Array> => {
  const keyBytes = Uint8Array.from(keyHex.match(/.{1,2}/g)?.map((x) => Number.parseInt(x, 16)) ?? []);
  const raw = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const nonceHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${keyHex}:${chunkIndex}`));
  const nonce = new Uint8Array(nonceHash).slice(0, 12);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, raw, data);
  const out = new Uint8Array(nonce.length + encrypted.byteLength);
  out.set(nonce, 0);
  out.set(new Uint8Array(encrypted), nonce.length);
  return out;
};
