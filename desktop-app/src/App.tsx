import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Sidebar } from '@/components/Sidebar';
import { StatusBanner } from '@/components/StatusBanner';
import { TitleBar } from '@/components/TitleBar';
import Home from '@/pages/Home';
import Send from '@/pages/Send';
import Receive from '@/pages/Receive';
import Transfer from '@/pages/Transfer';
import History from '@/pages/History';
import Settings from '@/pages/Settings';
import { desktopRuntime } from '@/services/p2p/DesktopRuntime';
import { usePeerStore } from '@/stores/peerStore';
import { useServerStore } from '@/stores/serverStore';
function Shell(): JSX.Element { const location = useLocation(); const { mode } = usePeerStore(); const serverRunning = useServerStore((state) => state.running); useEffect(() => { void desktopRuntime.restorePersistentSession(); void desktopRuntime.startServerMonitor(); return () => { desktopRuntime.stopServerMonitor(); }; }, []); const titles: Record<string, string> = { '/': 'Home', '/send': 'Send', '/receive': 'Receive', '/transfer': 'Transfer', '/history': 'History', '/settings': 'Settings' }; return <div className="flex h-screen flex-col"><TitleBar title={titles[location.pathname] ?? 'FileBeam'} mode={mode} serverRunning={serverRunning} /><StatusBanner /><div className="flex min-h-0 flex-1"><Sidebar /><main className="min-h-0 flex-1 overflow-auto p-6"><Routes><Route path="/" element={<Home />} /><Route path="/send" element={<Send />} /><Route path="/receive" element={<Receive />} /><Route path="/transfer" element={<Transfer />} /><Route path="/history" element={<History />} /><Route path="/settings" element={<Settings />} /></Routes></main></div></div>; }
export default function App(): JSX.Element { return <BrowserRouter><Shell /></BrowserRouter>; }
