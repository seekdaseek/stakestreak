import React, {useState, useCallback} from 'react';
import {View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Share} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {getPot, checkinPot, startPot, buyFreeze, refundPot} from '../services/api';
import {getSavedWallet, depositToTreasury} from '../services/wallet';
import {useToast} from '../components/Toast';

export default function PotDetailScreen({route}) {
  const {potId} = route.params;
  const [pot, setPot] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

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
      toast('Day ' + (r.day + 1) + ' survived', 'Streak alive. See you tomorrow.', 'win');
      load();
    } catch (e) { toast('Hmm', e.response?.data?.error || e.message, 'error'); }
    setBusy(false);
  };

  const doStart = async () => {
    setBusy(true);
    try { await startPot(potId, wallet); load(); }
    catch (e) { toast('Hmm', e.response?.data?.error || e.message, 'error'); }
    setBusy(false);
  };

  const doFreeze = async () => {
    setBusy(true);
    try {
      const sig = await depositToTreasury('FXpfE4xFNM3djJ9bxEz7iT7hzpMKSeYGXka1DFmxBywt', 0.015);
      const r = await buyFreeze(potId, wallet, sig);
      toast('Back from the dead', 'Day ' + r.coveredDay + ' covered. Don\'t waste it.', 'win');
      load();
    } catch (e) { toast('Hmm', e.response?.data?.error || e.message, 'error'); }
    setBusy(false);
  };

  return (
    <View style={st.wrap}>
      <Text style={st.title}>#{pot.id}</Text>
      <Text style={st.meta}>{pot.stake_lamports / 1e9} SOL stake · {pot.duration_days} days · {pot.status}{pot.day !== null ? ' · day ' + (pot.day + 1) : ''}</Text>
      <TouchableOpacity style={st.share} onPress={() => Share.share({message: 'Join my StakeStreak pot: https://seekdaseek.github.io/stakestreak/join.html?p=' + pot.id})}>
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

      {pot.status === 'open' && me?.deposit_sig !== undefined && (
        <TouchableOpacity style={[st.refund, busy && st.dim]} disabled={busy} onPress={async () => {
          setBusy(true);
          try { const r = await refundPot(potId, wallet); toast('Refunded', r.refunded + ' SOL returned to your wallet.'); load(); }
          catch (e) { toast('Hmm', e.response?.data?.error || e.message, 'error'); }
          setBusy(false);
        }}>
          <Text style={st.refundText}>Leave pot & refund my stake</Text>
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
  wrap: {flex: 1, backgroundColor: '#FFF4EC', padding: 16},
  title: {color: '#E8431F', fontSize: 28, fontWeight: '900'},
  meta: {color: '#8A7E72', marginTop: 6},
  share: {marginTop: 10},
  shareText: {color: '#FF5A36', fontWeight: '600'},
  cta: {backgroundColor: '#FF5A36', borderRadius: 20, padding: 16, alignItems: 'center', marginTop: 16},
  freeze: {backgroundColor: '#FF8C42', borderRadius: 20, padding: 16, alignItems: 'center', marginTop: 16},
  ctaText: {color: '#FFFFFF', fontWeight: '800', fontSize: 16},
  dim: {opacity: 0.5},
  refund: {marginTop: 14, alignItems: 'center', padding: 12},
  refundText: {color: '#8A7E72', fontWeight: '600', textDecorationLine: 'underline'},
  section: {color: '#E8431F', fontSize: 18, fontWeight: '900', marginTop: 24, marginBottom: 8},
  row: {flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#FFFFFF'},
  addr: {color: '#2B2118'},
  status: {fontWeight: '600'},
  green: {color: '#7BC950'},
  red: {color: '#FF3B6B'},
});
