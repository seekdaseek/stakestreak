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
  const [slots, setSlots] = useState([]); // minutes-into-day, up to 4
  const [timeInput, setTimeInput] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const addSlot = () => {
    const m = timeInput.trim().match(/^([0-2]?\d):([0-5]\d)$/);
    if (!m) { toast('Bad time', 'Use 24h format like 06:30 or 15:00', 'error'); return; }
    const h = parseInt(m[1]), min = parseInt(m[2]);
    if (h > 23) { toast('Bad time', 'Hour must be 0-23', 'error'); return; }
    if (slots.length >= 4) { toast('Max 4', 'Up to 4 check-in times per pot.', 'error'); return; }
    const mins = h * 60 + min;
    if (slots.includes(mins)) { toast('Already added', 'That time is already a slot.', 'error'); return; }
    setSlots([...slots, mins].sort((a,b)=>a-b));
    setTimeInput('');
  };
  const removeSlot = (mins) => setSlots(slots.filter(x => x !== mins));
  const fmtSlot = (mins) => String(Math.floor(mins/60)).padStart(2,'0') + ':' + String(mins%60).padStart(2,'0');

  const create = async () => {
    setBusy(true);
    try {
      if (!rule.trim()) { toast('Add a rule', 'What must players do each day?', 'error'); setBusy(false); return; }
      const wallet = await getSavedWallet();
      const pot = await createPot(wallet, parseFloat(stake), parseInt(days), {ruleText: rule.trim(), checkinSlots: slots});
      // creator deposits + joins immediately
      const sig = await depositToTreasury(pot.depositTo, parseFloat(stake));
      await joinPot(pot.potId, wallet, sig, -new Date().getTimezoneOffset());
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
      <Text style={st.label}>Check-in times (up to 4, local to each player)</Text>
      <View style={{flexDirection: 'row', gap: 8}}>
        <TextInput style={[st.input, {flex: 1}]} value={timeInput} onChangeText={setTimeInput} placeholder="e.g. 06:30" placeholderTextColor="#B8AC9E" keyboardType="numbers-and-punctuation" />
        <TouchableOpacity style={st.addBtn} onPress={addSlot}><Text style={st.addBtnText}>+ Add</Text></TouchableOpacity>
      </View>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10}}>
        {slots.map(mins => (
          <TouchableOpacity key={mins} style={st.chip} onPress={() => removeSlot(mins)}>
            <Text style={st.chipText}>{fmtSlot(mins)}  ✕</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={st.hint}>{slots.length === 0 ? 'No times set = one check-in anytime each day.' : 'Players must sign a check-in within 10 min of each time, in their own timezone. Miss one = out.'}</Text>
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
  addBtn: {backgroundColor: '#FFE3D6', borderRadius: 16, paddingHorizontal: 18, justifyContent: 'center'},
  addBtnText: {color: '#E8431F', fontWeight: '800'},
  chip: {backgroundColor: '#FF5A36', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8},
  chipText: {color: '#FFF', fontWeight: '800'},
  hint: {color: '#8A7E72', fontSize: 13, marginTop: 8, lineHeight: 18},
  cta: {backgroundColor: '#FF5A36', borderRadius: 20, padding: 16, alignItems: 'center', marginTop: 24},
  ctaText: {color: '#FFFFFF', fontWeight: '800', fontSize: 16},
});
