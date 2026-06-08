import React from 'react';
import { Text, View } from 'react-native';
import type { TransferProgressModel } from '../types';
export function TransferCard({ progress }: { progress: TransferProgressModel }): JSX.Element { return <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 24, padding: 16 }}><Text style={{ color: 'white', fontWeight: '700', fontSize: 18 }}>{progress.filename}</Text><Text style={{ color: '#00D4AA', fontSize: 28, marginTop: 8 }}>{(progress.speed / 1024 / 1024).toFixed(1)} MB/s</Text><Text style={{ color: 'rgba(255,255,255,0.65)', marginTop: 6 }}>{Math.round(progress.progress)}% complete</Text></View>; }
