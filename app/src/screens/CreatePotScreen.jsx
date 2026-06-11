import React, {useState} from 'react';
import {View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Share} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {createPot, joinPot, startPot} from '../services/api';
import {getSavedWallet, depositToTreasury} from '../services/wallet';
const dbg = (m) => fetch('http://localhost:3001/dbg?m=' + encodeURIComponent(m)).catch(()=>{});

export default function CreatePotScreen({navigation}) {
  const [stake, setStake] = useState('0.1');
  const [days, setDays] = useState('7');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const wallet = await getSavedWallet();
      dbg('creating pot');
      const pot = await createPot(wallet, parseFloat(stake), parseInt(days));
      // creator deposits + joins immediately
      dbg('pot created, depositing');
      const sig = await depositToTreasury(pot.depositTo, parseFloat(stake));
      dbg('deposited sig=' + sig.slice(0,12));
      await joinPot(pot.potId, wallet, sig);
      const ids = JSON.parse((await AsyncStorage.getItem('myPots')) || '[]');
      ids.unshift(pot.potId);
      await AsyncStorage.setItem('myPots', JSON.stringify(ids));
      await Share.share({message: 'Join my StakeStreak pot! Stake ' + stake + ' SOL, survive ' + days + ' days, split the quitters\u2019 stakes. Pot ID: ' + pot.potId});
      navigation.replace('PotDetail', {potId: pot.potId});
    } catch (e) {
      dbg('CREATE CATCH: ' + (e.response?.data?.error || e.message));
      Alert.alert('Error', e.response?.data?.error || e.message);
    }
    setBusy(false);
  };

  return (
    <View style={st.wrap}>
      <Text style={st.title}>New Pot</Text>
      <Text style={st.label}>Stake (SOL)</Text>
      <TextInput style={st.input} value={stake} onChangeText={setStake} keyboardType="decimal-pad" />
      <Text style={st.label}>Duration (days)</Text>
      <TextInput style={st.input} value={days} onChangeText={setDays} keyboardType="number-pad" />
      <Text style={st.note}>Everyone stakes the same amount. Miss a daily check-in and you're out — your stake goes to the survivors. 3% house fee on settlement.</Text>
      <TouchableOpacity style={[st.cta, busy && {opacity: 0.5}]} disabled={busy} onPress={create}>
        <Text style={st.ctaText}>{busy ? 'Creating...' : 'Stake & Create'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: '#0d0d14', padding: 16},
  title: {color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 16},
  label: {color: '#aaa', marginBottom: 6, marginTop: 12},
  input: {backgroundColor: '#1a1a26', color: '#fff', borderRadius: 10, padding: 14, fontSize: 18},
  note: {color: '#666', marginTop: 16, lineHeight: 20},
  cta: {backgroundColor: '#9f7aea', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24},
  ctaText: {color: '#fff', fontWeight: '700', fontSize: 16},
});
