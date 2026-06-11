import React, {useState, useEffect} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Linking, Clipboard} from 'react-native';
import {getSavedWallet, connection} from '../services/wallet';
import {getProStatus, getProPrice, burnForPro, activatePro, applyReferral} from '../services/api';
import {transact} from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import {PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL} from '@solana/web3.js';
import {Buffer} from 'buffer';
global.Buffer = global.Buffer || Buffer;

const TREASURY = '4a8o45skRPcyjAdyR8yES215Swvh8uTpZD6KLarhxCJ7';

export default function ProScreen() {
  const [proStatus, setProStatus] = useState(null);
  const [proPrice, setProPrice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [burning, setBurning] = useState(false);
  const [genesis, setGenesis] = useState(null);
  const [buyingGenesis, setBuyingGenesis] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [applyingReferral, setApplyingReferral] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const wallet = await getSavedWallet();
      setReferralCode(wallet ? wallet.slice(0, 8) : '');
      const [status, price, gen] = await Promise.all([getProStatus(wallet), getProPrice(), fetch('http://167.233.69.154/genesis/status').then(r=>r.json()).catch(()=>null)]);
      if (gen) setGenesis(gen);
      setProStatus(status);
      setProPrice(price);
    } catch (e) {}
    setLoading(false);
  }

  async function handlePaySOL() {
    Alert.alert('Pay with SOL', `Send ${proPrice?.solPrice || '0.075'} SOL to activate Pro for 30 days?`, [
      {text: 'Cancel'},
      {text: 'Pay', onPress: async () => {
        setPaying(true);
        try {
          const wallet = await getSavedWallet();
          const lamports = Math.round((proPrice?.solPrice || 0.075) * LAMPORTS_PER_SOL);
          const sig = await transact(async (mwa) => {
            const auth = await mwa.authorize({ cluster: 'mainnet-beta', identity: { name: 'StakeStreak', uri: 'https://seekdaseek.github.io/stakestreak', icon: 'favicon.ico' } });
            const payer = new PublicKey(Buffer.from(auth.accounts[0].address, 'base64'));
            const { blockhash } = await connection.getLatestBlockhash();
            const tx = new Transaction({ recentBlockhash: blockhash, feePayer: payer });
            tx.add(SystemProgram.transfer({ fromPubkey: payer, toPubkey: new PublicKey(TREASURY), lamports }));
            const signed = await mwa.signTransactions({ transactions: [tx] });
            const txSig = await connection.sendRawTransaction(signed[0].serialize());
            return txSig;
          });
          const result = await activatePro(wallet, sig);
          if (result.success) {
            Alert.alert('Pro activated!', `Active until ${new Date(result.expiresAt).toLocaleDateString()}`);
            await load();
          }
        } catch (e) {
          Alert.alert('Payment failed', e.message);
        } finally { setPaying(false); }
      }},
    ]);
  }

  async function handleBuyGenesis() {
    if (genesis?.soldOut) return Alert.alert('Sold out!', 'All 100 Genesis badges have been minted.');
    Alert.alert('Buy Genesis Badge', `0.1 SOL — one of ${genesis?.remaining || 100} remaining`, [
      {text: 'Cancel'},
      {text: 'Buy', onPress: async () => {
        setBuyingGenesis(true);
        try {
          const wallet = await getSavedWallet();
          const lamports = Math.round(0.1 * LAMPORTS_PER_SOL);
          const sig = await transact(async (mwa) => {
            const auth = await mwa.authorize({ cluster: 'mainnet-beta', identity: { name: 'StakeStreak', uri: 'https://seekdaseek.github.io/stakestreak', icon: 'favicon.ico' } });
            const payer = new PublicKey(Buffer.from(auth.accounts[0].address, 'base64'));
            const { blockhash } = await connection.getLatestBlockhash();
            const tx = new Transaction({ recentBlockhash: blockhash, feePayer: payer });
            tx.add(SystemProgram.transfer({ fromPubkey: payer, toPubkey: new PublicKey(TREASURY), lamports }));
            const signed = await mwa.signTransactions({ transactions: [tx] });
            return await connection.sendRawTransaction(signed[0].serialize());
          });
          const result = await fetch('http://167.233.69.154/genesis/mint', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ walletAddress: wallet, txSignature: sig })
          }).then(r => r.json());
          if (result.success) {
            Alert.alert('Genesis minted!', `You got #${result.number} — ${result.remaining} remaining`);
            setGenesis(g => g ? {...g, minted: g.minted+1, remaining: g.remaining-1} : g);
          } else {
            Alert.alert('Failed', result.error);
          }
        } catch(e) { Alert.alert('Error', e.message); }
        finally { setBuyingGenesis(false); }
      }},
    ]);
  }

  async function handleBurn() {
    Alert.alert('Burn 30 cNFTs for Pro', 'Burn 30 check-in badges to get 30 days Pro. Continue?', [
      {text: 'Cancel'},
      {text: 'Burn', style: 'destructive', onPress: async () => {
        setBurning(true);
        try {
          const wallet = await getSavedWallet();
          const result = await burnForPro(wallet, []);
          if (result.success) {
            Alert.alert('Pro extended!', `Active until ${new Date(result.expiresAt).toLocaleDateString()}`);
            await load();
          }
        } catch (e) {
          Alert.alert('Failed', e.response?.data?.error || e.message);
        } finally { setBurning(false); }
      }},
    ]);
  }

  async function handleApplyReferral() {
    Alert.prompt('Enter Referral Code', "Paste a friend's referral code (first 8 chars of their wallet)", async (code) => {
      if (!code) return;
      try {
        setApplyingReferral(true);
        const wallet = await getSavedWallet();
        await applyReferral(wallet, code.trim());
        Alert.alert('Success!', 'Referral applied — your friend gets 7 days Pro!');
      } catch (e) {
        Alert.alert('Failed', e?.response?.data?.error || e.message);
      } finally { setApplyingReferral(false); }
    });
  }

  function handleShareToX() {
    const tier = proStatus?.tier || 'Bronze';
    const text = encodeURIComponent('Building my streak on StakeStreak — ' + tier + ' tier on @SolanaFloor. Daily check-ins, cNFT badges, and streak rewards. https://seekdaseek.github.io/stakestreak #Solana #StakeStreak');
    Linking.openURL('https://twitter.com/intent/tweet?text=' + text);
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color="#E8C96A" size="large" /></View>;

  const isPro = proStatus?.isPro;
  const daysLeft = proStatus?.daysRemaining || 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>PRO</Text>

      <View style={[styles.statusBox, {borderColor: isPro ? '#C9A84C' : '#333'}]}>
        <Text style={{fontSize: 32}}>{isPro ? '⚡' : '○'}</Text>
        <Text style={[styles.statusText, {color: isPro ? '#E8C96A' : '#555'}]}>{isPro ? 'Pro Active' : 'Free Tier'}</Text>
        {isPro && <Text style={styles.daysLeft}>{daysLeft} days remaining</Text>}
      </View>

      <Text style={styles.sectionTitle}>Benefits</Text>
      {['Unlimited price alerts', 'Wallet movement alerts', 'Priority cNFT minting', 'Pro badge on your profile'].map(b => (
        <Text key={b} style={styles.benefit}>✓  {b}</Text>
      ))}
      <Text style={styles.benefitOff}>○  Free: 3 price alerts only</Text>

      <Text style={[styles.sectionTitle, {marginTop: 32}]}>Get Pro</Text>

      <TouchableOpacity style={styles.optionBox} onPress={handlePaySOL} disabled={paying}>
        <Text style={styles.optionTitle}>Pay with SOL</Text>
        <Text style={styles.optionSub}>{proPrice?.solPrice || '0.075'} SOL / 30 days</Text>
        <Text style={styles.optionSub}>Send to treasury wallet to activate</Text>
        <Text style={styles.treasury}>{TREASURY}</Text>
        {paying && <ActivityIndicator color="#C9A84C" style={{marginTop: 8}} />}
      </TouchableOpacity>

      {genesis && (
        <TouchableOpacity style={[styles.optionBox, {borderColor: genesis.soldOut ? '#333' : '#E8C96A', marginBottom: 16}]} onPress={handleBuyGenesis} disabled={buyingGenesis || genesis.soldOut}>
          <Text style={styles.optionTitle}>Genesis Badge Drop</Text>
          <Text style={styles.optionSub}>0.1 SOL · Limited to 100</Text>
          <Text style={styles.optionSub}>{genesis.soldOut ? 'SOLD OUT' : `${genesis.remaining} remaining`}</Text>
          {buyingGenesis && <ActivityIndicator color="#E8C96A" style={{marginTop: 8}} />}
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.burnBtn} onPress={handleBurn} disabled={burning}>
        {burning ? <ActivityIndicator color="#0a0a0a" /> : <Text style={styles.burnText}>Burn 30 cNFTs for Pro</Text>}
      </TouchableOpacity>

      <Text style={[styles.sectionTitle, {marginTop: 32}]}>Referral</Text>
      <View style={styles.referralBox}>
        <Text style={styles.referralLabel}>Your Code</Text>
        <Text style={styles.referralCode}>{referralCode}</Text>
        <TouchableOpacity onPress={() => { Clipboard.setString(referralCode); Alert.alert('Copied!', 'Share your code with friends for 7 days Pro each.'); }}>
          <Text style={styles.copyBtn}>Copy Code</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.referralApplyBtn} onPress={handleApplyReferral} disabled={applyingReferral}>
        {applyingReferral ? <ActivityIndicator color="#E8C96A" /> : <Text style={styles.referralApplyText}>Enter a Referral Code</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.shareBtn} onPress={handleShareToX}>
        <Text style={styles.shareText}>𝕏  Share to X</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0a0a0a'},
  content: {padding: 24, paddingTop: 60, paddingBottom: 40},
  center: {flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center'},
  heading: {color: '#E8C96A', fontSize: 24, fontWeight: 'bold', letterSpacing: 4, marginBottom: 24},
  statusBox: {borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 32, borderWidth: 1},
  statusText: {fontSize: 18, fontWeight: 'bold', letterSpacing: 2, marginTop: 8},
  daysLeft: {color: '#8B6914', fontSize: 12, marginTop: 4},
  sectionTitle: {color: '#C9A84C', fontSize: 13, letterSpacing: 3, marginBottom: 16},
  benefit: {color: '#E8C96A', fontSize: 14, marginBottom: 8},
  benefitOff: {color: '#444', fontSize: 14, marginBottom: 8},
  optionBox: {backgroundColor: '#111', borderRadius: 12, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#C9A84C'},
  optionTitle: {color: '#E8C96A', fontSize: 16, fontWeight: 'bold', marginBottom: 4},
  optionSub: {color: '#8B6914', fontSize: 13, marginBottom: 2},
  treasury: {color: '#C9A84C', fontSize: 11, marginTop: 8},
  burnBtn: {backgroundColor: '#1a1400', borderWidth: 1, borderColor: '#C9A84C', padding: 16, borderRadius: 8, alignItems: 'center'},
  burnText: {color: '#C9A84C', fontSize: 15, fontWeight: 'bold'},
  referralBox: {backgroundColor: '#111', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#333', alignItems: 'center'},
  referralLabel: {color: '#555', fontSize: 11, letterSpacing: 2, marginBottom: 4},
  referralCode: {color: '#E8C96A', fontSize: 22, fontWeight: 'bold', letterSpacing: 4, marginBottom: 8},
  copyBtn: {color: '#C9A84C', fontSize: 13, borderWidth: 1, borderColor: '#C9A84C', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 6},
  referralApplyBtn: {borderWidth: 1, borderColor: '#555', padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 16},
  referralApplyText: {color: '#888', fontSize: 14},
  shareBtn: {backgroundColor: '#111', borderWidth: 1, borderColor: '#1DA1F2', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 8},
  shareText: {color: '#1DA1F2', fontSize: 15, fontWeight: 'bold'},
});
