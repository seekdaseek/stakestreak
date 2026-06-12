import React from 'react';
import {View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking} from 'react-native';

const APPS = [
  {
    emoji: '\u26A1',
    name: 'SolWatch',
    desc: 'Daily SOL check-ins with a 365-badge streak collection, price alerts and leaderboards.',
    pkg: 'com.solwatch.app',
  },
  {
    emoji: '\uD83E\uDD77',
    name: 'ShadowDrop',
    desc: 'Send SOL or USDC anonymously with a claim link. No address needed from the receiver.',
    pkg: 'com.shadowdrop',
  },
  {
    emoji: '\uD83E\uDED9',
    name: 'Tip Jar',
    desc: 'Accept SOL tips with a Solana Pay QR code. Made for creators and small sellers.',
    pkg: 'com.solanatipjar',
  },
];

export default function MoreAppsScreen() {
  const open = pkg => {
    Linking.openURL('solanadappstore://details?id=' + pkg).catch(() =>
      Linking.openURL('https://seekdaseek.github.io/'),
    );
  };
  return (
    <ScrollView style={st.wrap} contentContainerStyle={{padding: 20}}>
      <Text style={st.intro}>More apps by seekdaseek, all on the Solana dApp Store.</Text>
      {APPS.map(a => (
        <View key={a.pkg} style={st.card}>
          <Text style={st.emoji}>{a.emoji}</Text>
          <Text style={st.name}>{a.name}</Text>
          <Text style={st.desc}>{a.desc}</Text>
          <TouchableOpacity style={st.btn} onPress={() => open(a.pkg)}>
            <Text style={st.btnText}>Open in dApp Store</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: '#FFF4EC'},
  intro: {color: '#8A7E72', fontSize: 15, marginBottom: 16, textAlign: 'center'},
  card: {backgroundColor: '#FFF', borderRadius: 20, borderWidth: 1, borderColor: '#FFE3D6', padding: 20, marginBottom: 16, alignItems: 'center'},
  emoji: {fontSize: 40, marginBottom: 8},
  name: {fontSize: 20, fontWeight: '900', color: '#2B2118', marginBottom: 6},
  desc: {fontSize: 14, color: '#8A7E72', textAlign: 'center', lineHeight: 20, marginBottom: 14},
  btn: {backgroundColor: '#FF5A36', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 24},
  btnText: {color: '#FFF', fontWeight: '800', fontSize: 15},
});
