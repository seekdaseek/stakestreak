import React from 'react';
import {View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert} from 'react-native';
import axios from 'axios';
import {getSavedWallet, disconnectWallet} from '../services/wallet';
import {useToast} from '../components/Toast';

const STEPS = [
  ['\uD83C\uDFC6', 'Create a pot', 'Pick a stake (in SOL) and a duration. Everyone puts in the same amount. It is held in escrow until the pot ends.'],
  ['\uD83D\uDC65', 'Friends join', 'Share your invite link. Friends stake the same amount and join before the pot starts.'],
  ['\u2600\uFE0F', 'Check in daily', 'Once started, every member must open the app and check in every single day. Miss a day and you are eliminated.'],
  ['\uD83E\uDDCA', 'Streak freeze', 'Slipped once? Buy a freeze (0.015 SOL) to cover one missed day and get back in. Max 2 per pot.'],
  ['\uD83D\uDCB0', 'Survivors split the pot', 'When time runs out, everyone still standing splits the whole pot equally - including the stakes of those who quit. A 3% service fee applies.'],
];

const SAMPLES = [
  {rule: "Wake up by 6:00am", pot: 2.4, players: 8, alive: 3, slots: "06:00", days: 7, status: "running"},
  {rule: "Gym check-in, twice daily", pot: 1.5, players: 6, alive: 2, slots: "12:00  18:00", days: 14, status: "running"},
  {rule: "No doomscrolling before noon", pot: 0.9, players: 5, alive: 2, slots: "12:00", days: 5, status: "ended"},
];

export default function HowItWorksScreen({navigation}) {
  const toast = useToast();

  const deleteAccount = () => {
    Alert.alert('Delete account?', 'This removes your check-in history and finished-pot records from our servers. On-chain transactions are permanent. You cannot delete while in a running pot.', [
      {text: 'Cancel'},
      {text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          const wallet = await getSavedWallet();
          await axios.post('http://167.233.69.154/stakestreak/account/delete', {wallet});
          await disconnectWallet();
          toast('Account deleted', 'Your off-chain data has been removed.');
          navigation.reset({index: 0, routes: [{name: 'Connect'}]});
        } catch (e) {
          toast('Cannot delete', e.response?.data?.error || e.message, 'error');
        }
      }},
    ]);
  };

  return (
    <ScrollView style={st.wrap} contentContainerStyle={{paddingBottom: 40}}>
      {STEPS.map(([emoji, title, body], i) => (
        <View key={i} style={st.card}>
          <Text style={st.emoji}>{emoji}</Text>
          <View style={{flex: 1}}>
            <Text style={st.title}>{title}</Text>
            <Text style={st.body}>{body}</Text>
          </View>
        </View>
      ))}
      <Text style={st.sampleHdr}>WHAT A POT LOOKS LIKE</Text>
      <Text style={st.sampleSub}>Illustrations only — not real pots you can join.</Text>
      {SAMPLES.map((s2, i) => (
        <View key={i} style={st.sampleCard}>
          <View style={st.watermark} pointerEvents="none"><Text style={st.watermarkText}>SAMPLE</Text></View>
          <Text style={st.sampleRule}>{s2.rule}</Text>
          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4}}>
            <Text style={st.samplePot}>{s2.pot} <Text style={st.samplePotUnit}>SOL pot</Text></Text>
            <Text style={s2.status === 'ended' ? st.samplePillOver : st.samplePill}>{s2.status === 'ended' ? s2.alive + ' split it 🏆' : s2.alive + '/' + s2.players + ' alive'}</Text>
          </View>
          <Text style={st.sampleMeta}>{s2.slots} {'\u00b7'} {s2.days} days {'\u00b7'} {s2.players} joined</Text>
        </View>
      ))}

      <TouchableOpacity style={st.more} onPress={() => navigation.navigate('MoreApps')}>
        <Text style={st.moreText}>More from ochinimus →</Text>
      </TouchableOpacity>
      <Text style={st.legal}>StakeStreak is a skill-based accountability challenge. Outcomes depend entirely on your own daily actions. Only stake what you can afford to lose, and make sure participation is lawful where you live.</Text>
      <TouchableOpacity style={st.del} onPress={deleteAccount}>
        <Text style={st.delText}>Delete my account & data</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: '#1A1310', padding: 16},
  card: {flexDirection: 'row', backgroundColor: '#241A15', borderRadius: 20, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: '#3A2E24', gap: 14},
  emoji: {fontSize: 30},
  title: {fontSize: 16, fontWeight: '800', color: '#FF7A54'},
  body: {color: '#B8AB9E', marginTop: 4, lineHeight: 20},
  more: {backgroundColor: '#241A15', borderRadius: 20, borderWidth: 1, borderColor: '#3A2E24', padding: 16, alignItems: 'center', marginTop: 4},
  moreText: {color: '#FF5A36', fontWeight: '800', fontSize: 15},
  sampleHdr: {color: '#8A7E72', fontSize: 12, fontWeight: '900', letterSpacing: 1.5, marginTop: 20, marginBottom: 2},
  sampleSub: {color: '#6B5D50', fontSize: 12, marginBottom: 10, fontStyle: 'italic'},
  sampleCard: {backgroundColor: '#241A15', borderRadius: 20, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: '#3A2E24', overflow: 'hidden'},
  watermark: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center'},
  watermarkText: {color: 'rgba(255,255,255,0.06)', fontSize: 44, fontWeight: '900', letterSpacing: 4, transform: [{rotate: '-18deg'}]},
  sampleRule: {color: '#FFFFFF', fontWeight: '900', fontSize: 16},
  samplePot: {color: '#FFD84D', fontSize: 22, fontWeight: '900'},
  samplePotUnit: {color: '#FFD84D', fontSize: 13},
  samplePill: {color: '#FF7A54', fontSize: 13, fontWeight: '900'},
  samplePillOver: {color: '#7BC950', fontSize: 13, fontWeight: '900'},
  sampleMeta: {color: '#8A7E72', fontSize: 12, fontWeight: '700', marginTop: 8},
  legal: {color: '#8A7E72', fontSize: 12, lineHeight: 18, marginTop: 8, marginBottom: 20, textAlign: 'center'},
  del: {alignItems: 'center', padding: 12},
  delText: {color: '#FF3B6B', fontWeight: '600', textDecorationLine: 'underline'},
});
