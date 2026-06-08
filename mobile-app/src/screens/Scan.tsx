import React, { useState } from 'react';
import { View } from 'react-native';
import { QRScanner } from '../components/QRScanner';
export default function Scan(): JSX.Element { const [code, setCode] = useState(''); return <View style={{ flex: 1, backgroundColor: '#0A0A1A' }}><QRScanner visible code={code} onChange={setCode} onClose={() => undefined} onSubmit={() => undefined} /></View>; }
