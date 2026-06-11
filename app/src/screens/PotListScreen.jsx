import React, {useState, useCallback} from 'react';
import {View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getPot} from '../services/api';

export default function PotListScreen({navigation}) {
  const [pots, setPots] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

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
      <Text style={st.title}>My Pots</Text>
      <FlatList
        data={pots}
        keyExtractor={p => p.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor="#fff" />}
        ListEmptyComponent={<Text style={st.empty}>No pots yet. Create one and invite friends.</Text>}
        renderItem={({item}) => (
          <TouchableOpacity style={st.card} onPress={() => navigation.navigate('PotDetail', {potId: item.id})}>
            <Text style={st.potId}>#{item.id}</Text>
            <Text style={st.meta}>{item.stake_lamports / 1e9} SOL · {item.duration_days}d · {item.status}{item.day !== null ? ' · day ' + item.day : ''}</Text>
            <Text style={st.meta}>{item.members.filter(m => m.status === 'active').length}/{item.members.length} alive</Text>
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
  wrap: {flex: 1, backgroundColor: '#0d0d14', padding: 16},
  title: {color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 12},
  empty: {color: '#666', marginTop: 40, textAlign: 'center'},
  card: {backgroundColor: '#1a1a26', borderRadius: 12, padding: 16, marginBottom: 10},
  potId: {color: '#9f7aea', fontWeight: '700', fontSize: 16},
  meta: {color: '#aaa', marginTop: 4},
  cta: {backgroundColor: '#9f7aea', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8},
  ctaText: {color: '#fff', fontWeight: '700', fontSize: 16},
});
