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
  ['\u21A9\uFE0F', 'Changed your mind?', 'Before a pot starts you can leave and get a full refund of your stake anytime.'],
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
      <TouchableOpacity style={st.more} onPress={() => navigation.navigate('MoreApps')}>
        <Text style={st.moreText}>More apps by seekdaseek \u2192</Text>
      </TouchableOpacity>
      <Text style={st.legal}>StakeStreak is a skill-based accountability challenge. Outcomes depend entirely on your own daily actions. Only stake what you can afford to lose, and make sure participation is lawful where you live.</Text>
      <TouchableOpacity style={st.del} onPress={deleteAccount}>
        <Text style={st.delText}>Delete my account & data</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: '#FFF4EC', padding: 16},
  card: {flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: '#FFE3D6', gap: 14},
  emoji: {fontSize: 30},
  title: {fontSize: 16, fontWeight: '800', color: '#E8431F'},
  body: {color: '#5C5247', marginTop: 4, lineHeight: 20},
  more: {backgroundColor: '#FFF', borderRadius: 20, borderWidth: 1, borderColor: '#FFE3D6', padding: 16, alignItems: 'center', marginTop: 4},
  moreText: {color: '#FF5A36', fontWeight: '800', fontSize: 15},
  legal: {color: '#8A7E72', fontSize: 12, lineHeight: 18, marginTop: 8, marginBottom: 20, textAlign: 'center'},
  del: {alignItems: 'center', padding: 12},
  delText: {color: '#FF3B6B', fontWeight: '600', textDecorationLine: 'underline'},
});
