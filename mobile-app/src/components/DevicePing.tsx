import React from 'react';
import { Text, View } from 'react-native';
export function DevicePing({ label, value }: { label: string; value: string }): JSX.Element { return <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 18, padding: 14, minWidth: 100 }}><Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>{label}</Text><Text style={{ color: 'white', fontWeight: '700', marginTop: 4 }}>{value}</Text></View>; }
