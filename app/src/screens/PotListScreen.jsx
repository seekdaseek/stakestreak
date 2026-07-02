import React, {useState, useCallback, useEffect} from 'react';
import {View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, TextInput} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getPot, joinPot, getFeed, registerNotify, unregisterNotify} from '../services/api';
import {getSavedWallet, depositToTreasury} from '../services/wallet';
import {useToast} from '../components/Toast';
import {C} from '../theme';

export default function PotListScreen({navigation, route}) {
  const [feed, setFeed] = useState({joinable: [], active: [], finished: []});
  const [myIds, setMyIds] = useState([]);
  const [tab, setTab] = useState('discover'); // 'discover' | 'mine'
  const [refreshing, setRefreshing] = useState(false);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [notifyOn, setNotifyOn] = useState(false);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const toast = useToast();

  useEffect(() => { (async () => {
    const pref = await AsyncStorage.getItem('notifyNewPots');
    setNotifyOn(pref === '1');
  })(); }, []);

  const toggleNotify = async () => {
    try {
      const token = await AsyncStorage.getItem('fcmToken');
      if (!token) { toast('Notifications unavailable', 'Allow notifications for StakeStreak in your phone settings, then reopen the app.', 'error'); return; }
      if (!notifyOn) {
        const wallet = await getSavedWallet();
        await registerNotify(token, wallet);
        await AsyncStorage.setItem('notifyNewPots', '1');
        setNotifyOn(true);
        toast('You\u2019re subscribed \uD83D\uDD14', 'We\u2019ll ping you when a new pot opens to join.', 'win');
      } else {
        await unregisterNotify(token);
        await AsyncStorage.setItem('notifyNewPots', '0');
        setNotifyOn(false);
        toast('Notifications off', 'You won\u2019t get new-pot alerts.', 'info');
      }
    } catch (e) { toast('Hmm', e.response?.data?.error || e.message, 'error'); }
  };

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
    try {
      const ids = JSON.parse((await AsyncStorage.getItem('myPots')) || '[]');
      setMyIds(ids);
      const f = await getFeed();
      setFeed(f);
    } catch (e) {}
    setRefreshing(false);
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const fmtLeft = (ms) => {
    if (ms <= 0) return 'closing';
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
  };

  const PotCard = ({item, kind}) => (
    <TouchableOpacity style={st.card} onPress={() => navigation.navigate('PotDetail', {potId: item.id})}>
      {item.rule_text ? <Text style={st.cardRule}>{item.rule_text}</Text> : <Text style={st.potId}>#{item.id}</Text>}
      <View style={st.potRow}>
        <Text style={st.pot}>{(+((item.stake_lamports * item.memberCount) / 1e9).toFixed(4))} <Text style={st.potUnit}>SOL</Text></Text>
        {kind === 'joinable' && item.fillEndsAt ?
          <Text style={st.pillUrgent}>{item.activeCount}/3 {'\u00b7'} {fmtLeft(item.fillEndsAt - now)} left</Text> :
         kind === 'active' ?
          <Text style={st.pill}>Day {Math.min((item.day || 0) + 1, item.duration_days)}/{item.duration_days}</Text> :
          <Text style={st.pillOver}>{item.status === 'settled' ? 'POT OVER' : 'ENDED'}</Text>}
      </View>
      {item.slots && item.slots.length > 0 ? (
        <Text style={st.slotsLine}>{item.slots.map(mins => String(Math.floor(mins/60)).padStart(2,'0') + ':' + String(mins%60).padStart(2,'0')).join('  ')} {'\u00b7'} {item.duration_days}d</Text>
      ) : <Text style={st.slotsLine}>{item.duration_days} days {'\u00b7'} check in daily</Text>}
      <Text style={st.metaLine}>{item.activeCount} in{kind === 'joinable' ? '  \u00b7  stake ' + (item.stake_lamports/1e9) + ' SOL to join' : ''}</Text>
    </TouchableOpacity>
  );

  const Section = ({title, data, kind}) => data.length > 0 ? (
    <View style={{marginBottom: 8}}>
      <Text style={st.secTitle}>{title}</Text>
      {data.map(item => <PotCard key={item.id} item={item} kind={kind} />)}
    </View>
  ) : null;

  const mineJoinable = feed.joinable.filter(p => myIds.includes(p.id));
  const mineActive = feed.active.filter(p => myIds.includes(p.id));
  const mineFinished = feed.finished.filter(p => myIds.includes(p.id));
  const showMine = mineJoinable.length + mineActive.length + mineFinished.length > 0;

  return (
    <View style={st.wrap}>
      <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14}}>
        <Text style={st.title}>StakeStreak</Text>
        <TouchableOpacity onPress={() => navigation.navigate('HowItWorks')}><Text style={{fontSize: 20, color: C.textDim}}>{'\u2754'}</Text></TouchableOpacity>
      </View>

      <TouchableOpacity style={[st.notify, notifyOn && st.notifyOn]} onPress={toggleNotify}>
        <Text style={[st.notifyText, notifyOn && st.notifyTextOn]}>{notifyOn ? '\uD83D\uDD14  Alerts on \u2014 tap to turn off' : '\uD83D\uDD14  Notify me when new pots drop'}</Text>
      </TouchableOpacity>

      <View style={st.tabs}>
        <TouchableOpacity style={[st.tab, tab === 'discover' && st.tabOn]} onPress={() => setTab('discover')}>
          <Text style={[st.tabText, tab === 'discover' && st.tabTextOn]}>Discover</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[st.tab, tab === 'mine' && st.tabOn]} onPress={() => setTab('mine')}>
          <Text style={[st.tabText, tab === 'mine' && st.tabTextOn]}>My Pots</Text>
        </TouchableOpacity>
      </View>

      <View style={st.joinRow}>
        <TextInput style={st.joinInput} value={code} onChangeText={setCode} placeholder="Have an invite code?" placeholderTextColor={C.textFaint} autoCapitalize="none" />
        <TouchableOpacity style={[st.joinBtn, (joining || !code.trim()) && st.dimmed]} disabled={joining || !code.trim()} onPress={join}>
          <Text style={st.joinBtnText}>{joining ? '...' : 'Join'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{flex: 1}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={C.orange} />}
        contentContainerStyle={{paddingBottom: 90}}>
        {tab === 'discover' ? (
          (feed.joinable.length + feed.active.length + feed.finished.length) === 0 ? (
            <Text style={st.empty}>No pots yet.{'\n'}Be the first {'\u2014'} create one below {'\uD83D\uDD25'}</Text>
          ) : (
            <>
              <Section title="OPEN TO JOIN" data={feed.joinable} kind="joinable" />
              <Section title="IN PROGRESS" data={feed.active} kind="active" />
              <Section title="PAST POTS" data={feed.finished} kind="finished" />
            </>
          )
        ) : (
          !showMine ? (
            <Text style={st.empty}>You haven't joined any pots yet.{'\n'}Tap Discover to find one {'\uD83D\uDD25'}</Text>
          ) : (
            <>
              <Section title="YOUR OPEN POTS" data={mineJoinable} kind="joinable" />
              <Section title="YOUR ACTIVE POTS" data={mineActive} kind="active" />
              <Section title="YOUR PAST POTS" data={mineFinished} kind="finished" />
            </>
          )
        )}
      </ScrollView>

      <TouchableOpacity style={st.cta} onPress={() => navigation.navigate('CreatePot')}>
        <Text style={st.ctaText}>+ NEW POT</Text>
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: C.bg, padding: 16, paddingTop: 20},
  title: {color: C.text, fontSize: 26, fontWeight: '900'},
  tabs: {flexDirection: 'row', gap: 8, marginBottom: 14},
  notify: {backgroundColor: C.card, borderWidth: 1, borderColor: C.cardEdge, borderRadius: 14, paddingVertical: 11, alignItems: 'center', marginBottom: 12},
  notifyOn: {backgroundColor: C.orangeBg, borderColor: C.orange},
  notifyText: {color: C.textDim, fontWeight: '800', fontSize: 13},
  notifyTextOn: {color: C.orangeLt},
  tab: {flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardEdge, borderRadius: 14, paddingVertical: 10, alignItems: 'center'},
  tabOn: {backgroundColor: C.orange, borderColor: C.orange},
  tabText: {color: C.textDim, fontWeight: '800', fontSize: 14},
  tabTextOn: {color: C.text},
  joinRow: {flexDirection: 'row', marginBottom: 16, gap: 8},
  joinInput: {flex: 1, backgroundColor: C.card, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, color: C.text, borderWidth: 1, borderColor: C.cardEdge},
  joinBtn: {backgroundColor: C.orange, borderRadius: 16, paddingHorizontal: 22, justifyContent: 'center'},
  joinBtnText: {color: C.text, fontWeight: '900'},
  dimmed: {opacity: 0.4},
  empty: {color: C.textDim, marginTop: 50, textAlign: 'center', fontSize: 15, lineHeight: 24},
  secTitle: {color: C.textDim, fontSize: 11, fontWeight: '900', letterSpacing: 1.5, marginTop: 12, marginBottom: 8},
  card: {backgroundColor: C.card, borderRadius: 20, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: C.cardEdge},
  cardRule: {color: C.text, fontWeight: '900', fontSize: 17, marginBottom: 6},
  potId: {color: C.orange, fontWeight: '800', fontSize: 15, marginBottom: 6},
  potRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  pot: {color: C.gold, fontSize: 26, fontWeight: '900'},
  potUnit: {fontSize: 14, color: C.gold},
  pill: {color: C.textDim, fontSize: 13, fontWeight: '800'},
  pillUrgent: {color: C.orangeLt, fontSize: 13, fontWeight: '900'},
  pillOver: {color: C.textDim, fontSize: 13, fontWeight: '900', letterSpacing: 0.5},
  slotsLine: {color: C.orangeLt, fontSize: 13, fontWeight: '700', marginTop: 8},
  metaLine: {color: C.textDim, fontSize: 12, fontWeight: '700', marginTop: 4},
  cta: {position: 'absolute', left: 16, right: 16, bottom: 16, backgroundColor: C.orange, borderRadius: 20, padding: 16, alignItems: 'center'},
  ctaText: {color: C.text, fontWeight: '900', fontSize: 16},
});
