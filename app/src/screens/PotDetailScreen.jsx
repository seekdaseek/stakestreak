import React, {useState, useCallback} from 'react';
import {View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Share} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {getPot, checkinPot, startPot, buyFreeze, refundPot} from '../services/api';
import {getSavedWallet, depositToTreasury, checkinTx} from '../services/wallet';
import {useToast} from '../components/Toast';
import {C, T, fmtTime} from '../theme';

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

  if (!pot) return <View style={[st.wrap,{justifyContent:"center",alignItems:"center"}]}><Text style={st.meta}>Loading...</Text></View>;

  const me = pot.members.find(m => String(m.wallet).trim() === String(wallet).trim());
  const isCreator = pot.creator === wallet;

  const doCheckin = async () => {
    setBusy(true);
    try {
      const ci = await checkinTx(pot.depositTo);
      const r = await checkinPot(potId, ci.payer, ci.sig);
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
      const dep = await depositToTreasury(pot.depositTo, 0.015);
      const r = await buyFreeze(potId, dep.payer, dep.sig);
      toast('Back from the dead', 'Day ' + r.coveredDay + ' covered. Don\'t waste it.', 'win');
      load();
    } catch (e) { toast('Hmm', e.response?.data?.error || e.message, 'error'); }
    setBusy(false);
  };

  return (
    <View style={st.wrap}>
      <ScrollView contentContainerStyle={{paddingBottom: 40}}>
        <View style={st.hdr}>
          <Text style={st.tag}>{'\uD83D\uDD25'} SURVIVE THE STREAK</Text>
        </View>
        {pot.rule_text ? <Text style={st.hero}>{pot.rule_text}</Text> : null}

        {(() => {
          const stake = pot.stake_lamports / 1e9;
          const n = pot.activeCount || pot.members.length;
          const rake = (pot.rakeBps || 300) / 10000;
          const pool = n * stake;
          const win = pool * (1 - rake);
          return (
            <View style={st.potCard}>
              <Text style={st.potLabel}>POT SIZE</Text>
              <Text style={st.potBig}>{(+pool.toFixed(4))} <Text style={st.potUnit}>SOL</Text></Text>
              {(pot.status === 'open' || pot.status === 'running') && me ?
                <Text style={st.potWin}>{'\u2191'} you could win up to {(+win.toFixed(4))}</Text> : null}
            </View>
          );
        })()}

        <View style={st.tiles}>
          <View style={st.tile}>
            <Text style={st.tileLabel}>DAY</Text>
            <Text style={st.tileVal}>{pot.status === 'running' && pot.day !== null ? Math.min(pot.day + 1, pot.duration_days) : '-'}<Text style={st.tileSub}>/{pot.duration_days}</Text></Text>
          </View>
          <View style={st.tile}>
            <Text style={st.tileLabel}>ALIVE</Text>
            <Text style={[st.tileVal,{color:C.green}]}>{pot.members.filter(m=>m.status==='active').length}<Text style={st.tileSub}>/{pot.members.length}</Text></Text>
          </View>
          <View style={st.tile}>
            <Text style={st.tileLabel}>STAKE</Text>
            <Text style={st.tileVal}>{pot.stake_lamports/1e9}</Text>
          </View>
        </View>

        {(() => {
          const filling = pot.status === 'open' || (pot.status === 'running' && !pot.locked);
          if (pot.status === 'settled') return <Text style={st.over}>POT OVER</Text>;
          if (pot.status === 'dead') return <Text style={st.over}>DIDN'T FILL {'\u2014'} REFUNDED</Text>;
          if (filling && pot.fillEndsAt) {
            const ms = pot.fillEndsAt - now;
            if (ms > 0) {
              const h = Math.floor(ms/3600000), m = Math.floor((ms%3600000)/60000), sec = Math.floor((ms%60000)/1000);
              return <Text style={st.countdown}>{(pot.activeCount||pot.members.length)}/3 to start {'\u00b7'} {h}h {m}m {sec}s to join</Text>;
            }
            return <Text style={st.meta}>Join window closed</Text>;
          }
          return null;
        })()}

        {pot.slots && pot.slots.length > 0 ? (
          <View style={{marginTop: 18}}>
            <Text style={st.secLabel}>TODAY'S CHECK-INS (your time)</Text>
            <View style={{flexDirection:'row', flexWrap:'wrap', gap: 8}}>
              {pot.slots.map((mins, i) => (
                <View key={i} style={st.slotCard}>
                  <Text style={st.slotTime}>{fmtTime(mins, false)}</Text>
                  <Text style={st.slotGrace}>{'\u00b1'}{pot.graceMin || 10}min</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {pot.status === 'running' && me?.status === 'active' && (
          <TouchableOpacity style={[st.cta, busy && st.dim]} disabled={busy} onPress={doCheckin}>
            <Text style={st.ctaText}>CHECK IN NOW</Text>
            <Text style={st.ctaSub}>sign to stay alive</Text>
          </TouchableOpacity>
        )}

        {pot.status === 'running' && me?.status === 'eliminated' && (
          <TouchableOpacity style={[st.freeze, busy && st.dim]} disabled={busy} onPress={doFreeze}>
            <Text style={st.ctaText}>Buy Streak Freeze</Text>
            <Text style={st.ctaSub}>0.015 SOL {'\u2014'} back from the dead</Text>
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

        <TouchableOpacity style={st.share} onPress={() => Share.share({message: (pot.rule_text ? '"' + pot.rule_text + '" ' + '\u2014' + ' ' : '') + 'Join my StakeStreak pot: https://seekdaseek.github.io/stakestreak/join.html?p=' + pot.id})}>
          <Text style={st.shareText}>+ Invite friends</Text>
        </TouchableOpacity>

        <Text style={st.section}>MEMBERS</Text>
        {pot.members.map(item => (
          <View key={item.wallet} style={st.row}>
            <Text style={st.addr}>{item.wallet.slice(0,4)}..{item.wallet.slice(-4)}{String(item.wallet).trim()===String(wallet).trim()?' (you)':''}</Text>
            <Text style={[st.statusPill, item.status==='active'?st.green:st.red]}>{item.status}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: C.bg, padding: 18, paddingTop: 20},
  hdr: {alignItems: 'center', marginBottom: 6},
  tag: {color: C.orange, fontSize: 11, fontWeight: '900', letterSpacing: 2},
  hero: {color: C.text, fontSize: 26, fontWeight: '900', textAlign: 'center', marginBottom: 4},
  meta: {color: C.textDim, fontSize: 13, textAlign: 'center'},
  potCard: {backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.cardEdge, padding: 18, alignItems: 'center', marginTop: 14},
  potLabel: {color: C.textDim, fontSize: 11, fontWeight: '800', letterSpacing: 1.5},
  potBig: {color: C.gold, fontSize: 38, fontWeight: '900', marginTop: 2},
  potUnit: {fontSize: 18, color: C.gold},
  potWin: {color: C.green, fontSize: 12, fontWeight: '800', marginTop: 6},
  tiles: {flexDirection: 'row', gap: 8, marginTop: 12},
  tile: {flex: 1, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardEdge, padding: 12, alignItems: 'center'},
  tileLabel: {color: C.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 1},
  tileVal: {color: C.text, fontSize: 20, fontWeight: '900', marginTop: 2},
  tileSub: {color: C.textFaint, fontSize: 13},
  countdown: {color: C.orangeLt, fontWeight: '800', marginTop: 14, fontSize: 15, textAlign: 'center'},
  over: {color: C.orange, fontWeight: '900', fontSize: 22, marginTop: 14, letterSpacing: 1, textAlign: 'center'},
  secLabel: {color: C.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8},
  slotCard: {backgroundColor: C.orangeBg, borderWidth: 1, borderColor: C.orange, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center'},
  slotTime: {color: C.orangeLt, fontSize: 15, fontWeight: '900'},
  slotGrace: {color: C.textDim, fontSize: 10, fontWeight: '700'},
  cta: {backgroundColor: C.orange, borderRadius: 18, padding: 16, alignItems: 'center', marginTop: 18},
  freeze: {backgroundColor: C.orangeLt, borderRadius: 18, padding: 16, alignItems: 'center', marginTop: 18},
  ctaText: {color: C.text, fontWeight: '900', fontSize: 16},
  ctaSub: {color: '#FFD5C8', fontSize: 11, fontWeight: '700', marginTop: 2},
  dim: {opacity: 0.5},
  refund: {marginTop: 14, alignItems: 'center', padding: 12},
  refundText: {color: C.textDim, fontWeight: '600', textDecorationLine: 'underline'},
  share: {marginTop: 14, alignItems: 'center'},
  shareText: {color: C.orange, fontWeight: '800', fontSize: 14},
  section: {color: C.textDim, fontSize: 12, fontWeight: '900', marginTop: 26, marginBottom: 8, letterSpacing: 1.5},
  row: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.cardEdge},
  addr: {color: C.text, fontWeight: '600', fontSize: 13},
  statusPill: {fontWeight: '800', fontSize: 12, textTransform: 'uppercase'},
  green: {color: C.green},
  red: {color: C.red},
});
