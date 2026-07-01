import React, {useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Alert} from 'react-native';
import {connectWallet} from '../services/wallet';

export default function ConnectScreen({navigation}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleConnect() {
    setLoading(true);
    setError(null);
    try {
      await connectWallet();
      navigation.replace('PotList');
    } catch (e) {
      setError('Connection failed. Make sure Seed Vault is set up.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>STAKESTREAK</Text>
      <Text style={styles.subtitle}>Stake. Survive. Split the pot.</Text>
      <Text style={{fontSize: 80, marginBottom: 32}}>🔥</Text>
      <Text style={styles.tagline}>Stake SOL with friends. Check in daily.{'\n'}Quitters fund the survivors.</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity style={styles.btn} onPress={handleConnect} disabled={loading}>
        {loading
          ? <ActivityIndicator color="#FFF4EC" />
          : <Text style={styles.btnText}>Connect Wallet</Text>
        }
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#1A1310', alignItems: 'center', justifyContent: 'center', padding: 32},
  title: {color: '#FF5A36', fontSize: 36, fontWeight: 'bold', letterSpacing: 6, marginBottom: 8},
  subtitle: {color: '#8A7E72', fontSize: 14, letterSpacing: 2, marginBottom: 40},
  badge: {width: 160, height: 160, marginBottom: 32},
  tagline: {color: '#FF5A36', fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 48},
  error: {color: '#ff4444', marginBottom: 16, textAlign: 'center'},
  btn: {backgroundColor: '#FF5A36', paddingVertical: 16, paddingHorizontal: 48, borderRadius: 8},
  btnText: {color: '#FFFFFF', fontSize: 16, fontWeight: 'bold', letterSpacing: 2},
});
