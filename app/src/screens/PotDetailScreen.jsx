import React, {useState, useCallback} from 'react';
import {View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Share} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {getPot, checkinPot, startPot, buyFreeze, refundPot} from '../services/api';
import {getSavedWallet, depositToTreasury, checkinTx} from '../services/wallet';
import {useToast} from '../components/Toast';

export default function PotDetailScreen({route}) {
  const {potId} = route.params;
  const [pot, setPot] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
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
      const sig = await checkinTx(pot.depositTo);
      const r = await checkinPot(potId, wallet, sig);
      const msg = r.slotsNeeded > 1 ? ('Check-in ' + r.slotsDone + ' of ' + r.slotsNeeded + ' done today.') : 'Streak alive. See you tomorrow.';
      toast(r.slotsDone >= r.slotsNeeded ? 'Day ' + (r.day + 1) + ' secured' : 'Checked in', msg, 'win');
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
      const sig = await depositToTreasury(pot.depositTo, 0.015);
      const r = await buyFreeze(potId, wallet, sig);
      toast('Back from the dead', 'Day ' + r.coveredDay + ' covered. Don\'t waste it.', 'win');
      load();
    } catch (e) { toast('Hmm', e.response?.data?.error || e.message, 'error'); }
    setBusy(false);
  };

  return (
    <View style={st.wrap}>
      {pot.rule_text ? <Text style={st.rule}>“{pot.rule_text}”</Text> : null}
      {pot.slots && pot.slots.length > 0 ? (
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8}}>
          {pot.slots.map((mins, i) => {
            const label = String(Math.floor(mins/60)).padStart(2,'0') + ':' + String(mins%60).padStart(2,'0');
            return <View key={i} style={st.slotChip}><Text style={st.slotChipText}>{label}</Text></View>;
          })}
          <Text style={st.slotNote}>each ±{pot.graceMin || 10}min, your time</Text>
        </View>
      ) : null}
      <Text style={st.meta}>{pot.stake_lamports / 1e9} SOL stake · {pot.duration_days} days</Text>
      {(() => {
        const filling = pot.status === 'open' || (pot.status === 'running' && !pot.locked);
        if (pot.status === 'settled') return <Text style={st.over}>POT OVER</Text>;
        if (pot.status === 'dead') return <Text style={st.over}>POT DIDN’T FILL — REFUNDED</Text>;
        if (filling && pot.fillEndsAt) {
          const ms = pot.fillEndsAt - now;
          if (ms > 0) {
            const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), sec = Math.floor((ms % 60000) / 1000);
            return <Text style={st.countdown}>{(pot.activeCount || pot.members.length)}/3 to start · {h}h {m}m {sec}s left to join</Text>;
          }
          return <Text style={st.meta}>Join window closed</Text>;
        }
        if (pot.status === 'running' && pot.day !== null) return <Text style={st.meta}>Day {Math.min(pot.day + 1, pot.duration_days)} of {pot.duration_days}</Text>;
        return <Text style={st.meta}>{pot.status}</Text>;
      })()}
      <TouchableOpacity style={st.share} onPress={() => Share.share({message: (pot.rule_text ? '“' + pot.rule_text + '” — ' : '') + 'Join my StakeStreak pot: https://seekdaseek.github.io/stakestreak/join.html?p=' + pot.id})}>
        <Text style={st.shareText}>Invite friends</Text>
      </TouchableOpacity>
      {(pot.status === 'open' || pot.status === 'running') && me && (() => {
        const stake = pot.stake_lamports / 1e9;
        const n = pot.activeCount || pot.members.length;
        const rake = (pot.rakeBps || 300) / 10000;
        const pool = n * stake * (1 - rake);
        return <Text style={st.win}>You staked {stake} SOL · if half drop out you could win ~{(pool / Math.max(1, Math.ceil(n/2))).toFixed(3)} SOL</Text>;
      })()}

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
  rule: {color: '#2B2118', fontSize: 20, fontWeight: '800', marginTop: 8, lineHeight: 26},
  slotChip: {backgroundColor: '#FFE3D6', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6},
  slotChipText: {color: '#E8431F', fontWeight: '800', fontSize: 13},
  slotNote: {color: '#8A7E72', fontSize: 12, alignSelf: 'center'},
  countdown: {color: '#E8431F', fontWeight: '800', marginTop: 8, fontSize: 15},
  over: {color: '#E8431F', fontWeight: '900', fontSize: 20, marginTop: 8, letterSpacing: 1},
  win: {color: '#7BC950', fontWeight: '700', marginTop: 12, fontSize: 14, lineHeight: 20},
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
