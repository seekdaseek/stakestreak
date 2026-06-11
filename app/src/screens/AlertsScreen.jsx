import React, {useState, useEffect} from 'react';
import {View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Switch} from 'react-native';
import {getSavedWallet} from '../services/wallet';
import {addPriceAlert, addWalletAlert, getAlerts, setWhaleAlerts, deleteAlert} from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKENS = [
  {label: 'SOL', mint: 'So11111111111111111111111111111111111111112'},
  {label: 'ETH', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'},
  {label: 'BTC', mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN'},
  {label: 'XRP', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'},
];

const TOKEN_LABELS = {
  'So11111111111111111111111111111111111111112': 'SOL',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'ETH',
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': 'BTC',
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 'XRP',
};

export default function AlertsScreen() {
  const [selectedToken, setSelectedToken] = useState(TOKENS[0]);
  const [targetPrice, setTargetPrice] = useState('');
  const [direction, setDirection] = useState('above');
  const [watchAddress, setWatchAddress] = useState('');
  const [minSol, setMinSol] = useState('');
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [whaleEnabled, setWhaleEnabled] = useState(false);

  useEffect(() => { loadAlerts(); loadWhaleStatus(); }, []);

  async function loadWhaleStatus() {
    try {
      const wallet = await getSavedWallet();
      const data = await getAlerts(wallet);
      if (data.whaleAlertsEnabled !== undefined) setWhaleEnabled(data.whaleAlertsEnabled);
    } catch (e) {}
  }

  async function handleDeleteAlert(id) {
    try {
      const wallet = await getSavedWallet();
      await deleteAlert(id, wallet);
      loadAlerts();
    } catch (e) { Alert.alert('Error', e.message); }
  }

  async function toggleWhaleAlerts(val) {
    setWhaleEnabled(val);
    try {
      const wallet = await getSavedWallet();
      const fcmToken = await AsyncStorage.getItem('fcmToken') || 'no_token';
      await setWhaleAlerts(wallet, val, fcmToken);
    } catch (e) { Alert.alert('Error', e.message); }
  }

  async function loadAlerts() {
    try {
      const wallet = await getSavedWallet();
      const data = await getAlerts(wallet);
      setAlerts([...(data.priceAlerts || []), ...(data.walletAlerts || [])]);
    } catch (e) {}
  }

  async function handlePriceAlert() {
    if (!targetPrice) return Alert.alert('Enter a target price');
    setLoading(true);
    try {
      const wallet = await getSavedWallet();
      const fcmToken = await AsyncStorage.getItem('fcmToken') || 'no_token';
      const result = await addPriceAlert(wallet, fcmToken, selectedToken.mint, parseFloat(targetPrice), direction);
      if (result.success) {
        Alert.alert('Alert set!', `You will be notified when ${selectedToken.label} goes ${direction} $${targetPrice}`);
        setTargetPrice('');
        loadAlerts();
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally { setLoading(false); }
  }

  async function handleWalletAlert() {
    if (!watchAddress) return Alert.alert('Enter a wallet address');
    setLoading(true);
    try {
      const wallet = await getSavedWallet();
      const fcmToken = await AsyncStorage.getItem('fcmToken') || 'no_token';
      await addWalletAlert(wallet, fcmToken, watchAddress, minSol || 0);
      Alert.alert('Wallet alert set!');
      setWatchAddress(''); setMinSol('');
      loadAlerts();
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally { setLoading(false); }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Price Alerts</Text>
      <Text style={styles.sectionSub}>Free: 3 active alerts · Pro: unlimited</Text>

      <View style={styles.tokenRow}>
        {TOKENS.map(t => (
          <TouchableOpacity key={t.mint} style={[styles.tokenBtn, selectedToken.mint === t.mint && styles.tokenBtnActive]} onPress={() => setSelectedToken(t)}>
            <Text style={[styles.tokenLabel, selectedToken.mint === t.mint && styles.tokenLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.directionRow}>
        <TouchableOpacity style={[styles.dirBtn, direction === 'above' && styles.dirBtnActive]} onPress={() => setDirection('above')}>
          <Text style={styles.dirLabel}>↑ Above</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.dirBtn, direction === 'below' && styles.dirBtnActive]} onPress={() => setDirection('below')}>
          <Text style={styles.dirLabel}>↓ Below</Text>
        </TouchableOpacity>
      </View>

      <TextInput style={styles.input} placeholder="Target price in USD" placeholderTextColor="#555" keyboardType="numeric" value={targetPrice} onChangeText={setTargetPrice} />
      <TouchableOpacity style={styles.btn} onPress={handlePriceAlert} disabled={loading}>
        {loading ? <ActivityIndicator color="#0a0a0a" /> : <Text style={styles.btnText}>Set Price Alert</Text>}
      </TouchableOpacity>

      {alerts.length > 0 && (
        <View style={styles.alertsList}>
          <Text style={styles.alertsTitle}>Active Alerts</Text>
          {alerts.map(a => (
            <View key={a.id} style={[styles.alertItem, !a.active && styles.alertInactive]}>
              <View style={{flex:1}}>
              {a.type === 'price' ? (
                <Text style={styles.alertText}>
                  {TOKEN_LABELS[a.tokenMint] || 'Token'} {a.direction} ${a.targetPrice} {!a.active ? '(inactive)' : ''}
                </Text>
              ) : (
                <Text style={styles.alertText}>Wallet: {a.watchAddress?.slice(0,8)}...</Text>
              )}
              </View>
              <TouchableOpacity onPress={() => handleDeleteAlert(a.id)} style={{padding:8}}>
                <Text style={{color:'#E8C96A', fontSize:18}}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <View style={styles.whaleRow}>
        <View>
          <Text style={styles.whaleTitle}>🐋 Whale Alerts</Text>
          <Text style={styles.whaleSub}>Free · Get notified on large SOL movements</Text>
        </View>
        <Switch
          value={whaleEnabled}
          onValueChange={toggleWhaleAlerts}
          trackColor={{false: '#333', true: '#C9A84C'}}
          thumbColor={whaleEnabled ? '#E8C96A' : '#666'}
        />
      </View>

      <View style={styles.divider} />
      <Text style={styles.sectionTitle}>Wallet Alerts</Text>
      <Text style={styles.sectionSub}>Pro only · Get notified on large transfers</Text>
      <TextInput style={styles.input} placeholder="Wallet address to watch" placeholderTextColor="#555" value={watchAddress} onChangeText={setWatchAddress} />
      <TextInput style={styles.input} placeholder="Min SOL amount (optional)" placeholderTextColor="#555" keyboardType="numeric" value={minSol} onChangeText={setMinSol} />
      <TouchableOpacity style={styles.btn} onPress={handleWalletAlert} disabled={loading}>
        <Text style={styles.btnText}>Set Wallet Alert</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0a0a0a'},
  content: {padding: 24, paddingTop: 60},
  sectionTitle: {color: '#E8C96A', fontSize: 20, fontWeight: 'bold', letterSpacing: 2, marginBottom: 4},
  sectionSub: {color: '#8B6914', fontSize: 12, marginBottom: 16},
  tokenRow: {flexDirection: 'row', gap: 8, marginBottom: 12},
  tokenBtn: {paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6, borderWidth: 1, borderColor: '#333'},
  tokenBtnActive: {backgroundColor: '#1a1400', borderColor: '#C9A84C'},
  tokenLabel: {color: '#555', fontSize: 13},
  tokenLabelActive: {color: '#E8C96A'},
  directionRow: {flexDirection: 'row', gap: 8, marginBottom: 12},
  dirBtn: {flex: 1, paddingVertical: 10, borderRadius: 6, borderWidth: 1, borderColor: '#333', alignItems: 'center'},
  dirBtnActive: {backgroundColor: '#1a1400', borderColor: '#C9A84C'},
  dirLabel: {color: '#C9A84C', fontSize: 13},
  input: {borderWidth: 1, borderColor: '#222', borderRadius: 6, padding: 12, color: '#E8C96A', marginBottom: 12, fontSize: 14},
  btn: {backgroundColor: '#C9A84C', padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 16},
  btnText: {color: '#0a0a0a', fontWeight: 'bold', fontSize: 15},
  alertsList: {marginTop: 8, marginBottom: 8},
  alertsTitle: {color: '#C9A84C', fontSize: 14, fontWeight: 'bold', marginBottom: 8, letterSpacing: 1},
  alertItem: {backgroundColor: '#111', borderRadius: 6, padding: 10, marginBottom: 6, borderLeftWidth: 2, borderLeftColor: '#C9A84C', flexDirection: 'row', alignItems: 'center'},
  alertInactive: {borderLeftColor: '#333', opacity: 0.5},
  alertText: {color: '#E8C96A', fontSize: 13},
  divider: {height: 1, backgroundColor: '#1a1a1a', marginVertical: 24},
  whaleRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16},
  whaleTitle: {color: '#E8C96A', fontSize: 16, fontWeight: 'bold'},
  whaleSub: {color: '#8B6914', fontSize: 12, marginTop: 2},
});
