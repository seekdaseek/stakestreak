import React, {useState} from 'react';
import {View, Text, TextInput, TouchableOpacity, StyleSheet, Share, ScrollView} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {createPot, joinPot, startPot} from '../services/api';
import {getSavedWallet, depositToTreasury} from '../services/wallet';
import {useToast} from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';

export default function CreatePotScreen({navigation}) {
  const [rule, setRule] = useState('');
  const [showSlotConfirm, setShowSlotConfirm] = useState(false);
  const [stake, setStake] = useState('0.1');
  const [days, setDays] = useState('7');
  const [slots, setSlots] = useState([]); // minutes-into-day, up to 4
  const [use24h, setUse24h] = useState(false);
  const [pickH, setPickH] = useState(6);   // 0-23 internal
  const [pickM, setPickM] = useState(0);    // 0,15,30,45
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const addSlot = () => {
    if (slots.length >= 4) { toast('Max 4', 'Up to 4 check-in times per pot.', 'error'); return; }
    const mins = pickH * 60 + pickM;
    if (slots.includes(mins)) { toast('Already added', 'That time is already a slot.', 'error'); return; }
    setSlots([...slots, mins].sort((a,b)=>a-b));
  };
  const removeSlot = (mins) => setSlots(slots.filter(x => x !== mins));
  const fmtSlot = (mins) => {
    const h = Math.floor(mins/60), m = mins%60;
    if (use24h) return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
    const ap = h < 12 ? 'am' : 'pm'; let h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ':' + String(m).padStart(2,'0') + ap;
  };
  // hour options depend on mode
  const hourOptions = use24h ? Array.from({length:24},(_,i)=>i) : [12,1,2,3,4,5,6,7,8,9,10,11];
  const setHourFrom12 = (h12, ap) => { let h = h12 % 12; if (ap === 'pm') h += 12; setPickH(h); };
  const curAmPm = pickH < 12 ? 'am' : 'pm';
  const curH12 = (() => { let x = pickH % 12; return x === 0 ? 12 : x; })();

  const create = () => {
    if (!rule.trim()) { toast('Add a rule', 'What must players do each day?', 'error'); return; }
    if (slots.length === 0) { setShowSlotConfirm(true); return; }
    doCreate();
  };

  const doCreate = async () => {
    setBusy(true);
    try {
      const wallet = await getSavedWallet();
      const pot = await createPot(wallet, parseFloat(stake), parseInt(days), {ruleText: rule.trim(), checkinSlots: slots});
      // creator deposits + joins immediately
      const dep = await depositToTreasury(pot.depositTo, parseFloat(stake));
      try {
        await joinPot(pot.potId, dep.payer, dep.sig, -new Date().getTimezoneOffset());
      } catch (je) {
        const msg = je.response?.data?.refunded ? ('Your ' + je.response.data.refunded + ' SOL was refunded. Try again.') : (je.response?.data?.error || je.message);
        toast('Deposit not credited', msg, 'error');
        setBusy(false);
        return;
      }
      const ids = JSON.parse((await AsyncStorage.getItem('myPots')) || '[]');
      ids.unshift(pot.potId);
      await AsyncStorage.setItem('myPots', JSON.stringify(ids));
      toast('You\u2019re in! ' + stake + ' SOL staked', 'Refunded if the pot doesn\u2019t fill (needs 3 players). Invite friends to lock it in.', 'win');
      navigation.replace('PotDetail', {potId: pot.potId});
    } catch (e) {
      toast('Couldn\'t create pot', e.response?.data?.error || e.message, 'error');
    }
    setBusy(false);
  };

  return (
    <>
    <ScrollView style={st.scroll} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Text style={st.title}>New Pot</Text>
      <Text style={st.label}>The rule (what must players do daily?)</Text>
      <TextInput style={st.input} value={rule} onChangeText={setRule} placeholder="e.g. Check in before 9am" placeholderTextColor="#6B5D50" maxLength={120} />
      <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
        <Text style={st.label}>Check-in times (up to 4, local time)</Text>
        <TouchableOpacity onPress={() => setUse24h(!use24h)} style={st.toggle}>
          <Text style={st.toggleText}>{use24h ? '24h' : 'AM/PM'}</Text>
        </TouchableOpacity>
      </View>
      <Text style={st.pickLabel}>Hour</Text>
      <View style={st.pickRow}>
        {hourOptions.map(h => {
          const active = use24h ? pickH === h : curH12 === h;
          return <TouchableOpacity key={h} style={[st.pick, active && st.pickOn]} onPress={() => use24h ? setPickH(h) : setHourFrom12(h, curAmPm)}>
            <Text style={[st.pickText, active && st.pickTextOn]}>{use24h ? String(h).padStart(2,'0') : h}</Text>
          </TouchableOpacity>;
        })}
      </View>
      <Text style={st.pickLabel}>Minute</Text>
      <View style={st.pickRow}>
        {[0,15,30,45].map(mm => (
          <TouchableOpacity key={mm} style={[st.pick, pickM === mm && st.pickOn]} onPress={() => setPickM(mm)}>
            <Text style={[st.pickText, pickM === mm && st.pickTextOn]}>{String(mm).padStart(2,'0')}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {!use24h && (
        <View style={st.pickRow}>
          {['am','pm'].map(ap => (
            <TouchableOpacity key={ap} style={[st.pick, curAmPm === ap && st.pickOn]} onPress={() => setHourFrom12(curH12, ap)}>
              <Text style={[st.pickText, curAmPm === ap && st.pickTextOn]}>{ap.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <TouchableOpacity style={st.addBtn} onPress={addSlot}>
        <Text style={st.addBtnText}>+ Add {fmtSlot(pickH*60+pickM)}</Text>
      </TouchableOpacity>
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
    </ScrollView>
    <ConfirmModal
      visible={showSlotConfirm}
      emoji={"⏰"}
      title="No check-in times set"
      message="This will be an anytime pot — players check in once per day, any time. To set specific times like 6:00am, go back and tap + Add after picking a time."
      cancelText="Add times"
      onCancel={() => setShowSlotConfirm(false)}
      confirmText="Use anytime"
      onConfirm={() => { setShowSlotConfirm(false); doCreate(); }}
    />
    </>
  );
}

const st = StyleSheet.create({
  scroll: {flex: 1, backgroundColor: '#1A1310'},
  wrap: {padding: 16, paddingBottom: 60, backgroundColor: '#1A1310'},
  title: {color: '#FFFFFF', fontSize: 28, fontWeight: '900', marginBottom: 16},
  label: {color: '#8A7E72', marginBottom: 6, marginTop: 12},
  input: {backgroundColor: '#241A15', color: '#FFFFFF', borderRadius: 16, padding: 14, fontSize: 18, borderWidth: 1, borderColor: '#3A2E24'},
  note: {color: '#8A7E72', marginTop: 16, lineHeight: 20},
  addBtn: {backgroundColor: '#2B1A15', borderWidth: 1, borderColor: '#FF5A36', borderRadius: 16, padding: 14, alignItems: 'center', marginTop: 10},
  addBtnText: {color: '#FF7A54', fontWeight: '800', fontSize: 15},
  toggle: {backgroundColor: '#2B1A15', borderWidth: 1, borderColor: '#FF5A36', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6},
  toggleText: {color: '#FF7A54', fontWeight: '800', fontSize: 12},
  pickLabel: {color: '#8A7E72', fontSize: 12, marginTop: 10, marginBottom: 4},
  pickRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  pick: {backgroundColor: '#241A15', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: '#3A2E24', minWidth: 44, alignItems: 'center'},
  pickOn: {backgroundColor: '#FF5A36', borderColor: '#FF5A36'},
  pickText: {color: '#FFFFFF', fontWeight: '700'},
  pickTextOn: {color: '#FFFFFF', fontWeight: '800'},
  chip: {backgroundColor: '#FF5A36', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8},
  chipText: {color: '#FFF', fontWeight: '800'},
  hint: {color: '#8A7E72', fontSize: 13, marginTop: 8, lineHeight: 18},
  cta: {backgroundColor: '#FF5A36', borderRadius: 20, padding: 16, alignItems: 'center', marginTop: 24},
  ctaText: {color: '#FFFFFF', fontWeight: '800', fontSize: 16},
});
