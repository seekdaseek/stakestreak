import React, {useState, useCallback, useEffect} from 'react';
import {View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, TextInput} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getPot, joinPot} from '../services/api';
import {getSavedWallet, depositToTreasury} from '../services/wallet';
import {useToast} from '../components/Toast';

export default function PotListScreen({navigation, route}) {
  const [pots, setPots] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
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
      if (pot.status !== 'open') throw new Error('This pot already started');
      const wallet = await getSavedWallet();
      if (pot.members.some(m => m.wallet === wallet)) throw new Error('You are already in this pot');
      const stake = pot.stake_lamports / 1e9;
      const sig = await depositToTreasury(pot.depositTo, stake);
      await joinPot(id, wallet, sig);
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
      <View style={st.blob} />
      <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
        <Text style={st.title}>My Pots</Text>
        <TouchableOpacity onPress={() => navigation.navigate('HowItWorks')}><Text style={{fontSize: 22}}>{'\u2754'}</Text></TouchableOpacity>
      </View>
      <View style={st.joinRow}>
        <TextInput style={st.joinInput} value={code} onChangeText={setCode} placeholder="Have an invite code?" placeholderTextColor="#B8AB9E" autoCapitalize="none" />
        <TouchableOpacity style={[st.joinBtn, (joining || !code.trim()) && st.dimmed]} disabled={joining || !code.trim()} onPress={join}>
          <Text style={st.joinBtnText}>{joining ? '...' : 'Join'}</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={pots}
        keyExtractor={p => p.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor="#FF5A36" />}
        ListEmptyComponent={<Text style={st.empty}>1. Create a pot  2. Friends join\n3. Check in daily  4. Survivors win \uD83D\uDD25</Text>}
        renderItem={({item}) => (
          <TouchableOpacity style={st.card} onPress={() => navigation.navigate('PotDetail', {potId: item.id})}>
            <Text style={st.potId}>#{item.id}</Text>
            <Text style={st.hero}>{item.stake_lamports * item.members.length / 1e9} SOL</Text>
            <Text style={st.meta}>{item.duration_days} days · {item.status}{item.day !== null ? ' · day ' + (item.day + 1) : ''}</Text>
            <Text style={st.flames}>{item.day !== null ? '\uD83D\uDD25'.repeat(Math.min(item.day + 1, 14)) + '\u26AA'.repeat(Math.max(0, Math.min(item.duration_days, 14) - item.day - 1)) : ''}</Text>
            <Text style={st.meta}>{item.members.filter(m => m.status === 'active').length} alive · {item.members.filter(m => m.status === 'eliminated').length} cooked 💀</Text>
          </TouchableOpacity>
        )}
      />
      <TouchableOpacity style={st.cta} onPress={() => navigation.navigate('CreatePot')}>
        <Text style={st.ctaText}>+ New Pot</Text>
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  joinRow: {flexDirection: 'row', marginBottom: 14, gap: 8},
  joinInput: {flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, color: '#2B2118', borderWidth: 1, borderColor: '#FFE3D6'},
  joinBtn: {backgroundColor: '#FF5A36', borderRadius: 16, paddingHorizontal: 22, justifyContent: 'center'},
  joinBtnText: {color: '#FFF', fontWeight: '800'},
  dimmed: {opacity: 0.4},
  wrap: {flex: 1, backgroundColor: '#FFF4EC', padding: 16, overflow: 'hidden'},
  blob: {position: 'absolute', top: -180, right: -120, width: 360, height: 360, borderRadius: 180, backgroundColor: '#FFE3D6', opacity: 0.6},
  hero: {color: '#FF5A36', fontSize: 34, fontWeight: '900', marginTop: 2},
  title: {color: '#E8431F', fontSize: 28, fontWeight: '900', marginBottom: 12},
  empty: {color: '#8A7E72', marginTop: 40, textAlign: 'center'},
  card: {backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 12, elevation: 3, borderWidth: 1, borderColor: '#FFE3D6'},
  potId: {color: '#FF5A36', fontWeight: '800', fontSize: 16},
  meta: {color: '#8A7E72', marginTop: 4, fontSize: 14, fontWeight: '600'},
  flames: {fontSize: 13, marginTop: 6, letterSpacing: 1},
  flames: {fontSize: 13, marginTop: 6, letterSpacing: 1},
  cta: {backgroundColor: '#FF5A36', borderRadius: 20, padding: 16, alignItems: 'center', marginTop: 8},
  ctaText: {color: '#FFFFFF', fontWeight: '800', fontSize: 16},
});
