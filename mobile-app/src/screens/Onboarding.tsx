import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
const slides = [
  { title: 'Lightning Transfer', body: 'Files fly directly between your devices.' },
  { title: 'Scan to Connect', body: 'Scan a QR code or enter a room code.' },
  { title: 'Anywhere', body: 'Same network or internet P2P.' },
];
export default function Onboarding({ onDone }: { onDone(): void }): JSX.Element { const [index, setIndex] = useState(0); const slide = slides[index]; return <View style={{ flex: 1, backgroundColor: '#0A0A1A', padding: 24, justifyContent: 'center' }}><View style={{ height: 260, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 24, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: 'white', fontSize: 48 }}>⚡</Text></View><Text style={{ color: 'white', fontSize: 30, fontWeight: '700' }}>{slide.title}</Text><Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 16, marginTop: 12 }}>{slide.body}</Text><Pressable onPress={() => index === slides.length - 1 ? onDone() : setIndex(index + 1)} style={{ marginTop: 32, backgroundColor: '#6C63FF', borderRadius: 18, padding: 16 }}><Text style={{ color: 'white', fontWeight: '700', textAlign: 'center' }}>{index === slides.length - 1 ? 'Get Started' : 'Next'}</Text></Pressable></View>; }
