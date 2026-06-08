import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { DeviceCard } from '@/components/DeviceCard';
import { HotspotHelper } from '@/components/HotspotHelper';
import { ModeSelector } from '@/components/ModeSelector';
import { PeerStatus } from '@/components/PeerStatus';
import { QRDisplay } from '@/components/QRDisplay';
import { QRScanner } from '@/components/QRScanner';
import { scanLanDevices } from '@/services/networkDetector';
import { desktopRuntime } from '@/services/p2p/DesktopRuntime';
import { usePeerStore } from '@/stores/peerStore';
import { useRoomStore } from '@/stores/roomStore';

export default function Home(): JSX.Element {
  const { room, hosting, setHosting, recentRooms, savedRooms } = useRoomStore();
  const { peer, mode, setMode, speedMBps } = usePeerStore();
  const [scanOpen, setScanOpen] = useState(false);
  const [helperOpen, setHelperOpen] = useState(false);
  const [lanDevices, setLanDevices] = useState<{ device_name: string; ip: string }[]>([]);
  const [manualCode, setManualCode] = useState('');
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (hosting) {
      void desktopRuntime.ensureHostedRoom(mode).catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : 'Failed to create room');
      });
    }
  }, [hosting, mode]);

  useEffect(() => {
    void scanLanDevices().then((devices) => {
      setLanDevices(devices.map((device) => ({ device_name: device.device_name, ip: device.ip })));
    });
  }, []);

  const refreshRoom = (): void => {
    void desktopRuntime.refreshHostedRoom(mode).catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Failed to refresh room');
    });
  };

  const connect = async (input: string): Promise<void> => {
    setConnecting(true);
    try {
      await desktopRuntime.connectFromInput(input);
      setHosting(false);
      setScanOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to connect');
    } finally {
      setConnecting(false);
    }
  };

  const tryRecentRoom = (key: string): void => {
    const saved = savedRooms[key];
    if (!saved) {
      toast.error('That recent room no longer has a saved QR payload. Scan it again.');
      return;
    }
    void connect(JSON.stringify(saved.qr_data));
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_1.2fr]">
      <div className="space-y-6">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-white shadow-glass">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="inline-flex rounded-2xl border border-white/10 bg-white/5 p-1 text-sm">
              <button className={`rounded-xl px-4 py-2 ${hosting ? 'bg-primary/20 text-white' : 'text-white/60'}`} onClick={() => setHosting(true)}>📡 Host Room</button>
              <button className={`rounded-xl px-4 py-2 ${!hosting ? 'bg-primary/20 text-white' : 'text-white/60'}`} onClick={() => setHosting(false)}>🔗 Join Room</button>
            </div>
            <ModeSelector value={mode} onChange={setMode} />
          </div>

          {hosting && room ? (
            <QRDisplay qrBase64={room.qr_image_base64} roomId={room.room_id} shortCode={room.room_code} mode={mode} expiresAt={room.expires_at} onRefresh={refreshRoom} ip={room.device_ip} peerName={peer?.device_name} />
          ) : (
            <div className="space-y-4">
              <div className="text-sm text-white/60">Paste QR JSON payload or reuse a previously scanned room</div>
              <textarea value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder='Paste the QR JSON here, e.g. {"v":1,...}' className="min-h-[140px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white outline-none" />
              <button className="w-full rounded-2xl bg-gradient-to-r from-primary to-accent px-4 py-4 font-semibold disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void connect(manualCode)} disabled={connecting}>Connect →</button>
              <button className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4" onClick={() => setScanOpen(true)}>📷 Scan QR with Webcam</button>
              <div>
                <div className="mb-2 text-sm text-white/50">Recently joined rooms</div>
                <div className="flex flex-wrap gap-2">
                  {recentRooms.map((item) => (
                    <button key={item} className="rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/15" onClick={() => tryRecentRoom(item)}>{item}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="mt-6">
            <div className="mb-2 text-sm text-white/60">Devices found on your network</div>
            <div className="flex flex-wrap gap-2">
              {lanDevices.map((device) => (
                <button key={`${device.device_name}-${device.ip}`} className="rounded-full bg-white/10 px-3 py-2 text-sm">{device.device_name} • {device.ip}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <PeerStatus onScan={() => setScanOpen(true)} />
        {peer ? (
          <DeviceCard device={peer} connectionType={mode} ping={mode === 'local' ? 2 : 24} speed={speedMBps} />
        ) : (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-white shadow-glass">
            <div className="mx-auto mb-6 grid h-40 w-64 place-items-center rounded-[32px] border border-white/10 bg-gradient-to-br from-white/5 to-primary/10">🔗</div>
            <div className="text-2xl font-semibold">Waiting for device to connect…</div>
            <div className="mt-2 text-white/60">Local IP: {room?.device_ip ?? '—'} • Mode: {mode === 'local' ? '🟢 Local Ready' : '🔵 Internet P2P Ready'}</div>
            <button className="mt-6 rounded-2xl bg-white/10 px-4 py-3" onClick={() => setHelperOpen(true)}>📡 Connection Helper</button>
          </div>
        )}
      </div>

      <QRScanner open={scanOpen} onClose={() => setScanOpen(false)} onDetected={(data) => void connect(data)} />
      <HotspotHelper open={helperOpen} onClose={() => setHelperOpen(false)} onSwitchInternet={() => { setMode('webrtc'); setHelperOpen(false); }} />
    </div>
  );
}
