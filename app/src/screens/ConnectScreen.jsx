import React, {useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Alert} from 'react-native';
import {connectWallet} from '../services/wallet';
const dbg = (m) => fetch('http://localhost:3001/dbg?m=' + encodeURIComponent(m)).catch(()=>{});

export default function ConnectScreen({navigation}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleConnect() {
    setLoading(true);
    setError(null);
    try {
      await connectWallet();
      dbg('wallet resolved, navigating');
      navigation.replace('PotList');
      dbg('navigate called');
    } catch (e) {
      dbg('CATCH: ' + e.message);
      setError('Connection failed. Make sure Seed Vault is set up.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SOLWATCH</Text>
      <Text style={styles.subtitle}>Daily check-ins. Legendary streaks.</Text>
      <Image
        source={{uri: 'https://seekdaseek.github.io/stakestreak/images/diamond.png'}}
        style={styles.badge}
      />
      <Text style={styles.tagline}>Check in daily. Earn cNFT badges.{'\n'}Reach Diamond. Become Prometheus.</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity style={styles.btn} onPress={handleConnect} disabled={loading}>
        {loading
          ? <ActivityIndicator color="#0a0a0a" />
          : <Text style={styles.btnText}>Connect Wallet</Text>
        }
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center', padding: 32},
  title: {color: '#E8C96A', fontSize: 36, fontWeight: 'bold', letterSpacing: 6, marginBottom: 8},
  subtitle: {color: '#8B6914', fontSize: 14, letterSpacing: 2, marginBottom: 40},
  badge: {width: 160, height: 160, marginBottom: 32},
  tagline: {color: '#C9A84C', fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 48},
  error: {color: '#ff4444', marginBottom: 16, textAlign: 'center'},
  btn: {backgroundColor: '#C9A84C', paddingVertical: 16, paddingHorizontal: 48, borderRadius: 8},
  btnText: {color: '#0a0a0a', fontSize: 16, fontWeight: 'bold', letterSpacing: 2},
});
