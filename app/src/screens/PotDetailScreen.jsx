import React, {useState, useCallback} from 'react';
import {View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Share} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {getPot, checkinPot, startPot, buyFreeze} from '../services/api';
import {getSavedWallet, depositToTreasury} from '../services/wallet';

export default function PotDetailScreen({route}) {
  const {potId} = route.params;
  const [pot, setPot] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setWallet(await getSavedWallet());
    try { setPot(await getPot(potId)); } catch (e) {}
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  if (!pot) return <View style={st.wrap}><Text style={st.meta}>Loading...</Text></View>;

  const me = pot.members.find(m => m.wallet === wallet);
  const isCreator = pot.creator === wallet;

  const doCheckin = async () => {
    setBusy(true);
    try {
      const r = await checkinPot(potId, wallet);
      Alert.alert('Checked in', 'Day ' + r.day + ' survived.');
      load();
    } catch (e) { Alert.alert('Error', e.response?.data?.error || e.message); }
    setBusy(false);
  };

  const doStart = async () => {
    setBusy(true);
    try { await startPot(potId, wallet); load(); }
    catch (e) { Alert.alert('Error', e.response?.data?.error || e.message); }
    setBusy(false);
  };

  const doFreeze = async () => {
    setBusy(true);
    try {
      const sig = await depositToTreasury('FXpfE4xFNM3djJ9bxEz7iT7hzpMKSeYGXka1DFmxBywt', 0.015);
      const r = await buyFreeze(potId, wallet, sig);
      Alert.alert('Freeze applied', 'Day ' + r.coveredDay + ' covered. You are back in.');
      load();
    } catch (e) { Alert.alert('Error', e.response?.data?.error || e.message); }
    setBusy(false);
  };

  return (
    <View style={st.wrap}>
      <Text style={st.title}>#{pot.id}</Text>
      <Text style={st.meta}>{pot.stake_lamports / 1e9} SOL stake · {pot.duration_days} days · {pot.status}{pot.day !== null ? ' · day ' + pot.day : ''}</Text>
      <TouchableOpacity style={st.share} onPress={() => Share.share({message: 'Join my StakeStreak pot: ' + pot.id})}>
        <Text style={st.shareText}>Invite friends</Text>
      </TouchableOpacity>

      {pot.status === 'open' && isCreator && (
        <TouchableOpacity style={[st.cta, busy && st.dim]} disabled={busy} onPress={doStart}>
          <Text style={st.ctaText}>Start Pot ({pot.members.length} joined)</Text>
        </TouchableOpacity>
      )}

      {pot.status === 'running' && me?.status === 'active' && (
        <TouchableOpacity style={[st.cta, busy && st.dim]} disabled={busy} onPress={doCheckin}>
          <Text style={st.ctaText}>Check In Today</Text>
        </TouchableOpacity>
      )}

      {pot.status === 'running' && me?.status === 'eliminated' && (
        <TouchableOpacity style={[st.freeze, busy && st.dim]} disabled={busy} onPress={doFreeze}>
          <Text style={st.ctaText}>Buy Streak Freeze (0.015 SOL)</Text>
        </TouchableOpacity>
      )}

      <Text style={st.section}>Members</Text>
      <FlatList
        data={pot.members}
        keyExtractor={m => m.wallet}
        renderItem={({item}) => (
          <View style={st.row}>
            <Text style={st.addr}>{item.wallet.slice(0, 4)}..{item.wallet.slice(-4)}{item.wallet === wallet ? ' (you)' : ''}</Text>
            <Text style={[st.status, item.status === 'active' ? st.green : st.red]}>{item.status}</Text>
          </View>
        )}
      />
    </View>
  );
}

const st = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: '#0d0d14', padding: 16},
  title: {color: '#fff', fontSize: 24, fontWeight: '700'},
  meta: {color: '#aaa', marginTop: 6},
  share: {marginTop: 10},
  shareText: {color: '#9f7aea', fontWeight: '600'},
  cta: {backgroundColor: '#9f7aea', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 16},
  freeze: {backgroundColor: '#2b6cb0', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 16},
  ctaText: {color: '#fff', fontWeight: '700', fontSize: 16},
  dim: {opacity: 0.5},
  section: {color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 24, marginBottom: 8},
  row: {flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1a1a26'},
  addr: {color: '#ddd'},
  status: {fontWeight: '600'},
  green: {color: '#48bb78'},
  red: {color: '#f56565'},
});
