import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Share, RefreshControl} from 'react-native';
import {getSavedWallet} from '../services/wallet';

const TIER_EMOJI = {Bronze: '🥉', Silver: '🥈', Gold: '🥇', Platinum: '💎', Diamond: '👑'};

export default function LeaderboardScreen() {
  const [board, setBoard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myWallet, setMyWallet] = useState(null);
  const [myRank, setMyRank] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { load(); }, []);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function load() {
    try {
      const [w, res] = await Promise.all([
        getSavedWallet(),
        fetch('http://167.233.69.154/leaderboard').then(r => r.json())
      ]);
      setMyWallet(w);
      setBoard(res.leaderboard || []);
      if (w) {
        const short = w.slice(0, 4) + '...' + w.slice(-4);
        const found = res.leaderboard?.find(e => e.wallet === short);
        if (found) setMyRank(found.rank);
      }
    } catch (e) {}
    setLoading(false);
  }

  async function handleShare() {
    if (!myRank) return;
    await Share.share({
      message: `I'm ranked #${myRank} on StakeStreak with a ${board.find(e=>e.rank===myRank)?.streak}-day streak! Daily check-ins. Legendary badges. 👁️ #StakeStreak #Solana`,
    });
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color="#E8C96A" size="large"/></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>LEADERBOARD</Text>
        {myRank && (
          <TouchableOpacity onPress={handleShare} style={styles.shareBtn}>
            <Text style={styles.shareText}>Share #{myRank}</Text>
          </TouchableOpacity>
        )}
      </View>

      {myRank && (
        <View style={styles.myRankBox}>
          <Text style={styles.myRankText}>Your rank: #{myRank}</Text>
        </View>
      )}

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor='#E8C96A'/>}>
        {board.map(entry => (
          <View key={entry.rank} style={[styles.row, entry.rank <= 3 && styles.topRow]}>
            <Text style={[styles.rank, entry.rank === 1 && {color:'#FFD700'}, entry.rank === 2 && {color:'#C0C0C0'}, entry.rank === 3 && {color:'#CD7F32'}]}>
              {entry.rank === 1 ? '👑' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
            </Text>
            <View style={styles.info}>
              <Text style={styles.wallet}>{entry.wallet}</Text>
              <Text style={styles.tier}>{TIER_EMOJI[entry.tier]} {entry.tier}</Text>
            </View>
            <View style={styles.streakBox}>
              <Text style={styles.streak}>{entry.streak}</Text>
              <Text style={styles.streakLabel}>streak</Text>
            </View>
          </View>
        ))}
        {board.length === 0 && <Text style={styles.empty}>No entries yet. Be the first!</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0a0a0a'},
  center: {flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center'},
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, paddingTop: 60},
  title: {color: '#E8C96A', fontSize: 20, fontWeight: 'bold', letterSpacing: 4},
  shareBtn: {backgroundColor: '#1a1400', borderWidth: 1, borderColor: '#C9A84C', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6},
  shareText: {color: '#C9A84C', fontSize: 12, fontWeight: 'bold'},
  myRankBox: {marginHorizontal: 24, marginBottom: 16, backgroundColor: '#1a1400', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#C9A84C'},
  myRankText: {color: '#E8C96A', textAlign: 'center', fontWeight: 'bold'},
  row: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#111'},
  topRow: {backgroundColor: '#0f0d00'},
  rank: {color: '#8B6914', fontSize: 18, width: 44, fontWeight: 'bold'},
  info: {flex: 1},
  wallet: {color: '#E8C96A', fontSize: 13, fontWeight: 'bold'},
  tier: {color: '#8B6914', fontSize: 11, marginTop: 2},
  streakBox: {alignItems: 'center'},
  streak: {color: '#E8C96A', fontSize: 22, fontWeight: 'bold'},
  streakLabel: {color: '#8B6914', fontSize: 10, letterSpacing: 1},
  empty: {color: '#555', textAlign: 'center', marginTop: 60},
});
