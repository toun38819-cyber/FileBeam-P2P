import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Onboarding from './screens/Onboarding';
import Home from './screens/Home';
import Send from './screens/Send';
import Receive from './screens/Receive';
import Progress from './screens/Progress';
import History from './screens/History';
import Settings from './screens/Settings';
const tabs = ['home', 'send', 'receive', 'progress', 'history', 'settings'] as const;
type Tab = (typeof tabs)[number];
export default function App(): JSX.Element { const [ready, setReady] = useState(false); const [tab, setTab] = useState<Tab>('home'); useEffect(() => { const id = setTimeout(() => setReady(true), 300); return () => clearTimeout(id); }, []); if (!ready) return <Onboarding onDone={() => setReady(true)} />; const screens: Record<Tab, JSX.Element> = { home: <Home />, send: <Send />, receive: <Receive />, progress: <Progress />, history: <History />, settings: <Settings /> }; return <View style={{ flex: 1 }}><View style={{ flex: 1 }}>{screens[tab]}</View><View style={{ flexDirection: 'row', backgroundColor: '#101223', paddingVertical: 10 }}>{tabs.map((item) => <Pressable key={item} onPress={() => setTab(item)} style={{ flex: 1, padding: 12 }}><Text style={{ color: tab === item ? '#FFFFFF' : 'rgba(255,255,255,0.5)', textAlign: 'center', textTransform: 'capitalize' }}>{item}</Text></Pressable>)}</View></View>; }
