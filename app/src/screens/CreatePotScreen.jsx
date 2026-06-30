import React, {useState} from 'react';
import {View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Share} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {createPot, joinPot, startPot} from '../services/api';
import {getSavedWallet, depositToTreasury} from '../services/wallet';
import {useToast} from '../components/Toast';

export default function CreatePotScreen({navigation}) {
  const [rule, setRule] = useState('');
  const [stake, setStake] = useState('0.1');
  const [days, setDays] = useState('7');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const create = async () => {
    setBusy(true);
    try {
      if (!rule.trim()) { toast('Add a rule', 'What must players do each day?', 'error'); setBusy(false); return; }
      const wallet = await getSavedWallet();
      const pot = await createPot(wallet, parseFloat(stake), parseInt(days), {ruleText: rule.trim()});
      // creator deposits + joins immediately
      const sig = await depositToTreasury(pot.depositTo, parseFloat(stake));
      await joinPot(pot.potId, wallet, sig);
      const ids = JSON.parse((await AsyncStorage.getItem('myPots')) || '[]');
      ids.unshift(pot.potId);
      await AsyncStorage.setItem('myPots', JSON.stringify(ids));
      await Share.share({message: '"' + rule.trim() + '" \u2014 stake ' + stake + ' SOL, survive ' + days + ' days, split the quitters\u2019 stakes. Join: https://seekdaseek.github.io/stakestreak/join.html?p=' + pot.potId});
      navigation.replace('PotDetail', {potId: pot.potId});
    } catch (e) {
      toast('Couldn\'t create pot', e.response?.data?.error || e.message, 'error');
    }
    setBusy(false);
  };

  return (
    <View style={st.wrap}>
      <Text style={st.title}>New Pot</Text>
      <Text style={st.label}>The rule (what must players do daily?)</Text>
      <TextInput style={st.input} value={rule} onChangeText={setRule} placeholder="e.g. Check in before 9am" placeholderTextColor="#B8AC9E" maxLength={120} />
      <Text style={st.label}>Stake (SOL)</Text>
      <TextInput style={st.input} value={stake} onChangeText={setStake} keyboardType="decimal-pad" />
      <Text style={st.label}>Duration (days)</Text>
      <TextInput style={st.input} value={days} onChangeText={setDays} keyboardType="number-pad" />
      <Text style={st.note}>Everyone stakes the same. Pot starts when 3 join; others can join for 24h, then it locks. Miss the rule any day and you're out — your stake goes to the survivors who finish.</Text>
      <TouchableOpacity style={[st.cta, busy && {opacity: 0.5}]} disabled={busy} onPress={create}>
        <Text style={st.ctaText}>{busy ? 'Creating...' : 'Stake & Create'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: '#FFF4EC', padding: 16},
  title: {color: '#E8431F', fontSize: 28, fontWeight: '900', marginBottom: 16},
  label: {color: '#8A7E72', marginBottom: 6, marginTop: 12},
  input: {backgroundColor: '#FFFFFF', color: '#2B2118', borderRadius: 16, padding: 14, fontSize: 18},
  note: {color: '#8A7E72', marginTop: 16, lineHeight: 20},
  cta: {backgroundColor: '#FF5A36', borderRadius: 20, padding: 16, alignItems: 'center', marginTop: 24},
  ctaText: {color: '#FFFFFF', fontWeight: '800', fontSize: 16},
});
