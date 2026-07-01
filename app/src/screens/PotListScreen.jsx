import React, {useState, useCallback, useEffect} from 'react';
import {View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, TextInput} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getPot, joinPot} from '../services/api';
import {getSavedWallet, depositToTreasury} from '../services/wallet';
import {useToast} from '../components/Toast';
import {C} from '../theme';

export default function PotListScreen({navigation, route}) {
  const [pots, setPots] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const toast = useToast();

  useEffect(() => {
    const p = route.params?.p;
    if (p) {
      setCode(String(p).trim().toLowerCase());
      navigation.setParams({p: undefined});
      toast('Invite code pasted', 'Review the stake, then tap Join.', 'info');
    }
  }, [route.params?.p]);

  const join = async () => {
    const id = code.trim().toLowerCase();
    if (!id) return;
    setJoining(true);
    try {
      const pot = await getPot(id);
      if (pot.status === 'settled' || pot.status === 'dead') throw new Error('This pot is finished');
      if (pot.locked) throw new Error('Join window closed');
      const wallet = await getSavedWallet();
      if (pot.members.some(m => m.wallet === wallet)) throw new Error('You are already in this pot');
      const stake = pot.stake_lamports / 1e9;
      const dep = await depositToTreasury(pot.depositTo, stake);
      await joinPot(id, dep.payer, dep.sig, -new Date().getTimezoneOffset());
      const ids = JSON.parse((await AsyncStorage.getItem('myPots')) || '[]');
      if (!ids.includes(id)) { ids.unshift(id); await AsyncStorage.setItem('myPots', JSON.stringify(ids)); }
      setCode('');
      toast('You are in', stake + ' SOL staked. Survive every day.', 'win');
      load();
    } catch (e) {
      toast('Could not join', e.response?.data?.error || e.message, 'error');
    }
    setJoining(false);
  };

  const load = async () => {
    setRefreshing(true);
    const ids = JSON.parse((await AsyncStorage.getItem('myPots')) || '[]');
    const results = [];
    for (const id of ids) {
      try { results.push(await getPot(id)); } catch (e) {}
    }
    setPots(results);
    setRefreshing(false);
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  return (
    <View style={st.wrap}>
      <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14}}>
        <Text style={st.title}>My Pots</Text>
        <TouchableOpacity onPress={() => navigation.navigate('HowItWorks')}><Text style={{fontSize: 20, color: C.textDim}}>{'\u2754'}</Text></TouchableOpacity>
      </View>
      <View style={st.joinRow}>
        <TextInput style={st.joinInput} value={code} onChangeText={setCode} placeholder="Have an invite code?" placeholderTextColor={C.textFaint} autoCapitalize="none" />
        <TouchableOpacity style={[st.joinBtn, (joining || !code.trim()) && st.dimmed]} disabled={joining || !code.trim()} onPress={join}>
          <Text style={st.joinBtnText}>{joining ? '...' : 'Join'}</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={pots}
        keyExtractor={p => p.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={C.orange} />}
        ListEmptyComponent={<Text style={st.empty}>No pots yet.{'\n'}Create one, invite friends,{'\n'}check in daily, survive to win {'\uD83D\uDD25'}</Text>}
        renderItem={({item}) => (
          <TouchableOpacity style={st.card} onPress={() => navigation.navigate('PotDetail', {potId: item.id})}>
            {item.rule_text ? <Text style={st.cardRule}>{item.rule_text}</Text> : <Text style={st.potId}>#{item.id}</Text>}
            <View style={st.potRow}>
              <Text style={st.pot}>{(+((item.stake_lamports * item.members.length) / 1e9).toFixed(4))} <Text style={st.potUnit}>SOL</Text></Text>
              {(() => {
                const filling = item.status === 'open' || (item.status === 'running' && !item.locked);
                if (item.status === 'settled') return <Text style={st.pillOver}>POT OVER</Text>;
                if (item.status === 'dead') return <Text style={st.pillOver}>REFUNDED</Text>;
                if (filling && item.fillEndsAt) {
                  const ms = item.fillEndsAt - now;
                  if (ms > 0) { const h = Math.floor(ms/3600000), m = Math.floor((ms%3600000)/60000); return <Text style={st.pillUrgent}>{(item.activeCount||item.members.length)}/3 {'\u00b7'} {h}h {m}m</Text>; }
                  return <Text style={st.pill}>locking...</Text>;
                }
                return <Text style={st.pill}>Day {Math.min((item.day||0)+1, item.duration_days)}/{item.duration_days}</Text>;
              })()}
            </View>
            <Text style={st.flames}>{item.day !== null && item.status==='running' ? '\uD83D\uDD25'.repeat(Math.min(item.day + 1, 14)) + '\u26AA'.repeat(Math.max(0, Math.min(item.duration_days, 14) - item.day - 1)) : ''}</Text>
            <Text style={st.meta}>{item.members.filter(m => m.status === 'active').length} alive {'\u00b7'} {item.members.filter(m => m.status === 'eliminated').length} cooked {'\uD83D\uDC80'}</Text>
          </TouchableOpacity>
        )}
      />
      <TouchableOpacity style={st.cta} onPress={() => navigation.navigate('CreatePot')}>
        <Text style={st.ctaText}>+ NEW POT</Text>
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: C.bg, padding: 16, paddingTop: 20},
  title: {color: C.text, fontSize: 28, fontWeight: '900'},
  joinRow: {flexDirection: 'row', marginBottom: 16, gap: 8},
  joinInput: {flex: 1, backgroundColor: C.card, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, color: C.text, borderWidth: 1, borderColor: C.cardEdge},
  joinBtn: {backgroundColor: C.orange, borderRadius: 16, paddingHorizontal: 22, justifyContent: 'center'},
  joinBtnText: {color: C.text, fontWeight: '900'},
  dimmed: {opacity: 0.4},
  empty: {color: C.textDim, marginTop: 50, textAlign: 'center', fontSize: 15, lineHeight: 24},
  card: {backgroundColor: C.card, borderRadius: 20, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: C.cardEdge},
  cardRule: {color: C.text, fontWeight: '900', fontSize: 17, marginBottom: 6},
  potId: {color: C.orange, fontWeight: '800', fontSize: 15, marginBottom: 6},
  potRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  pot: {color: C.gold, fontSize: 28, fontWeight: '900'},
  potUnit: {fontSize: 14, color: C.gold},
  pill: {color: C.textDim, fontSize: 13, fontWeight: '800'},
  pillUrgent: {color: C.orangeLt, fontSize: 13, fontWeight: '900'},
  pillOver: {color: C.textDim, fontSize: 13, fontWeight: '900', letterSpacing: 0.5},
  flames: {fontSize: 14, marginTop: 8, letterSpacing: 1},
  meta: {color: C.textDim, marginTop: 6, fontSize: 13, fontWeight: '700'},
  cta: {backgroundColor: C.orange, borderRadius: 20, padding: 16, alignItems: 'center', marginTop: 8},
  ctaText: {color: C.text, fontWeight: '900', fontSize: 16},
});
