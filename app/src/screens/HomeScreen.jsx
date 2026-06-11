import React, {useState, useEffect} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Image, ScrollView, ActivityIndicator, Alert, Modal, Pressable} from 'react-native';
import {getSavedWallet, disconnectWallet} from '../services/wallet';
import {BADGE_FIGURES} from '../data/badgeFigures';
import {checkin, getProStatus, getStats, freezeStreak} from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TIER_IMAGES = {
  Bronze: 'https://seekdaseek.github.io/stakestreak/images/bronze.png',
  Silver: 'https://seekdaseek.github.io/stakestreak/images/silver.png',
  Gold: 'https://seekdaseek.github.io/stakestreak/images/gold.png',
  Platinum: 'https://seekdaseek.github.io/stakestreak/images/platinum.png',
  Diamond: 'https://seekdaseek.github.io/stakestreak/images/diamond.png',
};

const TIER_FIGURES = {
  Bronze: 'Leonardo da Vinci',
  Silver: 'Socrates',
  Gold: 'Sun Tzu',
  Platinum: 'Achilles',
  Diamond: 'Prometheus',
};

export default function HomeScreen({navigation}) {
  const [wallet, setWallet] = useState(null);
  const [stats, setStats] = useState(null);
  const [proStatus, setProStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [freezing, setFreezing] = useState(false);
  const [alreadyCheckedIn, setAlreadyCheckedIn] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const [selectedBadge, setSelectedBadge] = useState(null);

  useEffect(() => { init(); }, []);

  async function init() {
    const w = await getSavedWallet();
    setWallet(w);
    if (w) await loadData(w);
    setLoading(false);
  }

  async function loadData(w) {
    try {
      const [pro, statsData] = await Promise.all([getProStatus(w), getStats(w)]);
      setProStatus(pro);
      if (statsData) {
        const s = statsData.streak || 0;
        const tier = s >= 365 ? 'Diamond' : s >= 100 ? 'Platinum' : s >= 30 ? 'Gold' : s >= 14 ? 'Silver' : 'Bronze';
        setStats({...statsData, tier});
      }
      const cached = await AsyncStorage.getItem('lastCheckin');
      if (cached === new Date().toDateString()) setAlreadyCheckedIn(true);
    } catch (e) {}
    setStatsLoading(false);
  }

  async function handleCheckin() {
    if (alreadyCheckedIn) {
      Alert.alert('Already checked in', 'Come back tomorrow to keep your streak!');
      return;
    }
    setCheckingIn(true);
    try {
      const fcmToken = await AsyncStorage.getItem('fcmToken') || 'no_token';
      const result = await checkin(wallet, fcmToken);
      const s = result.streak || 0;
      const tier = s >= 365 ? 'Diamond' : s >= 100 ? 'Platinum' : s >= 30 ? 'Gold' : s >= 14 ? 'Silver' : 'Bronze';
      setStats(prev => ({...prev, ...result, tier}));
      await AsyncStorage.setItem('lastCheckin', new Date().toDateString());
      await AsyncStorage.setItem('lastStats', JSON.stringify(result));
      setAlreadyCheckedIn(true);
    } catch (e) {
      Alert.alert('Check-in failed', e.message);
    } finally {
      setCheckingIn(false);
    }
  }

  async function handleDisconnect() {
    Alert.alert('Disconnect', 'Are you sure?', [
      {text: 'Cancel'},
      {text: 'Disconnect', onPress: async () => {
        await disconnectWallet();
        navigation.replace('Connect');
      }},
    ]);
  }

  const handleFreeze = async () => {
    if (!wallet) return;
    Alert.alert(
      'Use Streak Freeze?',
      'Burns 1 check-in badge to protect your streak for 48 hours.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Burn & Freeze', style: 'destructive', onPress: async () => {
          try {
            setFreezing(true);
            await freezeStreak(wallet, fcmToken);
            Alert.alert('Streak Frozen!', 'Your streak is protected for 48 hours.');
          } catch (e) {
            Alert.alert('Error', e?.response?.data?.error || 'Freeze failed');
          } finally {
            setFreezing(false);
          }
        }},
      ]
    );
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#E8C96A" size="large" /></View>;
  }

  if (statsLoading) return <View style={styles.center}><ActivityIndicator color="#E8C96A" size="large" /></View>;
  const tier = stats?.tier || 'Bronze';
  const streak = stats?.streak || 0;
  const totalCheckins = stats?.totalCheckins || 0;
  const figure = TIER_FIGURES[tier];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>SOLWATCH</Text>
        {proStatus?.isPro && <Text style={styles.proBadge}>⚡ PRO</Text>}
      </View>

      <Image source={{uri: TIER_IMAGES[tier]}} style={styles.badge} />
      <Text style={styles.figure}>{figure}</Text>
      <Text style={styles.tier}>{tier} Tier</Text>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{streak}</Text>
          <Text style={styles.statLabel}>Streak</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{stats?.monthlyCheckins || 0}</Text>
          <Text style={styles.statLabel}>This month</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{totalCheckins}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.checkinBtn, alreadyCheckedIn && styles.checkinBtnDone]}
        onPress={handleCheckin}
        disabled={checkingIn || alreadyCheckedIn}>
        {checkingIn
          ? <ActivityIndicator color="#0a0a0a" />
          : <Text style={alreadyCheckedIn ? styles.checkinTextDone : styles.checkinText}>{alreadyCheckedIn ? '✓ Checked In Today' : 'Check In'}</Text>
        }
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.freezeBtn}
        onPress={handleFreeze}
        disabled={freezing}>
        {freezing
          ? <ActivityIndicator color="#4FC3F7" />
          : <Text style={styles.freezeText}>🧊 Use Streak Freeze</Text>
        }
      </TouchableOpacity>

      {totalCheckins > 0 && (
        <View style={styles.badgesSection}>
          <Text style={styles.badgesTitle}>MY BADGES</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
            {Array.from({length: totalCheckins}, (_, i) => i + 1).map(day => (
              <TouchableOpacity key={day} onPress={() => setSelectedBadge(day)}>
                <Image
                  source={{uri: `https://seekdaseek.github.io/stakestreak/images/historical/day-${day}.png`}}
                  style={styles.badgeThumb}
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <Modal visible={!!selectedBadge} transparent animationType="fade" onRequestClose={() => setSelectedBadge(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedBadge(null)}>
          <View style={styles.modalBox}>
            <Image
              source={{uri: `https://seekdaseek.github.io/stakestreak/images/historical/day-${selectedBadge}.png`}}
              style={styles.modalImage}
            />
            <Text style={styles.modalFigure}>{BADGE_FIGURES[selectedBadge] || ''}</Text>
            <Text style={styles.modalDay}>Day {selectedBadge}</Text>
            <Text style={styles.modalClose}>Tap to close</Text>
          </View>
        </Pressable>
      </Modal>

      <Text style={styles.walletText}>
        {wallet ? wallet.slice(0, 6) + '...' + wallet.slice(-4) : ''}
      </Text>
      <TouchableOpacity onPress={handleDisconnect}>
        <Text style={styles.disconnect}>Disconnect</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0a0a0a'},
  content: {alignItems: 'center', paddingTop: 60, paddingBottom: 40, paddingHorizontal: 24},
  center: {flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center'},
  header: {flexDirection: 'row', alignItems: 'center', marginBottom: 32, gap: 12},
  title: {color: '#E8C96A', fontSize: 28, fontWeight: 'bold', letterSpacing: 6},
  proBadge: {color: '#E8C96A', fontSize: 12, borderWidth: 1, borderColor: '#E8C96A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4},
  badge: {width: 200, height: 200, marginBottom: 16, borderRadius: 8, borderWidth: 1, borderColor: '#C9A84C'},
  figure: {color: '#E8C96A', fontSize: 20, fontWeight: 'bold', fontStyle: 'italic', marginBottom: 4},
  tier: {color: '#8B6914', fontSize: 13, letterSpacing: 2, marginBottom: 32},
  statsRow: {flexDirection: 'row', gap: 32, marginBottom: 32},
  stat: {alignItems: 'center'},
  statNum: {color: '#E8C96A', fontSize: 28, fontWeight: 'bold'},
  statLabel: {color: '#8B6914', fontSize: 11, letterSpacing: 1},
  checkinBtn: {backgroundColor: '#C9A84C', paddingVertical: 16, paddingHorizontal: 48, borderRadius: 8, marginBottom: 32, width: '100%', alignItems: 'center'},
  checkinBtnDone: {backgroundColor: '#1a1400', borderWidth: 1, borderColor: '#C9A84C'},
  freezeBtn: {backgroundColor: 'transparent', borderWidth: 1, borderColor: '#4FC3F7', paddingVertical: 12, paddingHorizontal: 48, borderRadius: 8, marginBottom: 16, width: '100%', alignItems: 'center'},
  freezeText: {color: '#4FC3F7', fontSize: 14, fontWeight: 'bold', letterSpacing: 1},
  checkinText: {color: '#0a0a0a', fontSize: 16, fontWeight: 'bold', letterSpacing: 2},
  checkinTextDone: {color: '#C9A84C', fontSize: 16, fontWeight: 'bold', letterSpacing: 2},
  badgesSection: {width: '100%', marginBottom: 32},
  badgesTitle: {color: '#8B6914', fontSize: 11, letterSpacing: 2, marginBottom: 12},
  badgeThumb: {width: 64, height: 64, borderRadius: 6, marginRight: 8, borderWidth: 1, borderColor: '#C9A84C'},
  walletText: {color: '#8B6914', fontSize: 11, marginBottom: 8},
  disconnect: {color: '#444', fontSize: 12, textDecorationLine: 'underline'},
  modalOverlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center'},
  modalBox: {alignItems: 'center', padding: 24},
  modalImage: {width: 280, height: 280, borderRadius: 12, borderWidth: 1, borderColor: '#C9A84C', marginBottom: 16},
  modalFigure: {color: '#E8C96A', fontSize: 20, fontWeight: 'bold', marginBottom: 4},
  modalDay: {color: '#8B6914', fontSize: 13, letterSpacing: 2},
  modalClose: {color: '#555', fontSize: 12, marginTop: 8},
});
