import React from 'react';
import {View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking} from 'react-native';

const APPS = [
  {
    emoji: '\u26A1',
    name: 'skrly',
    desc: 'Action & earn super-app for Seeker — quests, trading, and a tribe leaderboard. Earn XP and rewards.',
  },
  {
    emoji: '\uD83D\uDD14',
    name: 'MarketBell',
    desc: 'Track crypto, NY, London and Tokyo market sessions with countdowns. Never miss an open or close.',
  },
  {
    emoji: '\uD83D\uDC40',
    name: 'SolWatch',
    desc: 'Daily SOL check-ins with a 365-badge streak collection, price alerts and leaderboards.',
  },
  {
    emoji: '\uD83E\uDDD8',
    name: 'Deep Work Timer',
    desc: 'A locked Pomodoro focus timer that keeps you off your phone until the session is done.',
  },
  {
    emoji: '\uD83E\uDD77',
    name: 'ShadowDrop',
    desc: 'Send SOL or USDC anonymously with a claim link. No address needed from the receiver.',
  },
  {
    emoji: '\uD83E\uDED9',
    name: 'Tip Jar',
    desc: 'Accept SOL tips with a Solana Pay QR code. Made for creators and small sellers.',
  },
];

export default function MoreAppsScreen() {
  const open = () => Linking.openURL('https://ochinimus.app');
  return (
    <ScrollView style={st.wrap} contentContainerStyle={{padding: 20}}>
      <Text style={st.intro}>More from ochinimus \u2014 all on the Solana dApp Store.</Text>
      {APPS.map(a => (
        <View key={a.name} style={st.card}>
          <Text style={st.emoji}>{a.emoji}</Text>
          <Text style={st.name}>{a.name}</Text>
          <Text style={st.desc}>{a.desc}</Text>
          <TouchableOpacity style={st.btn} onPress={open}>
            <Text style={st.btnText}>Visit ochinimus.app</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: '#1A1310'},
  intro: {color: '#8A7E72', fontSize: 15, marginBottom: 16, textAlign: 'center'},
  card: {backgroundColor: '#241A15', borderRadius: 20, borderWidth: 1, borderColor: '#3A2E24', padding: 20, marginBottom: 16, alignItems: 'center'},
  emoji: {fontSize: 34, marginBottom: 8},
  name: {fontSize: 20, fontWeight: '900', color: '#FFFFFF', marginBottom: 6},
  desc: {fontSize: 14, color: '#8A7E72', textAlign: 'center', lineHeight: 20, marginBottom: 14},
  btn: {backgroundColor: '#FF5A36', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 24},
  btnText: {color: '#FFF', fontWeight: '800', fontSize: 15},
});
