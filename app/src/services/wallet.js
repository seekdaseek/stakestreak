import {transact} from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import {Connection, PublicKey} from '@solana/web3.js';
import {Buffer} from 'buffer';
import AsyncStorage from '@react-native-async-storage/async-storage';
global.Buffer = global.Buffer || Buffer;

export const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=78d99db0-c1bc-41d9-a268-faaf8fd825ce', 'confirmed');

export async function connectWallet() {
  const result = await transact(async (wallet) => {
    const auth = await wallet.authorize({ cluster: 'mainnet-beta', identity: { name: 'StakeStreak', uri: 'https://stakestreak.ochinimus.app', icon: 'favicon.ico' } });
    return auth.accounts[0].address;
  });
  const pubkey = new PublicKey(Buffer.from(result, 'base64')).toBase58();
  await AsyncStorage.setItem('walletAddress', pubkey);
  return pubkey;
}

export async function getSavedWallet() {
  return await AsyncStorage.getItem('walletAddress');
}

export async function disconnectWallet() {
  await AsyncStorage.removeItem('walletAddress');
}

export async function depositToTreasury(treasuryAddress, amountSol) {
  const {SystemProgram, Transaction, PublicKey: PK} = require('@solana/web3.js');
  let payerAddr = null;
  const sig = await transact(async (mwa) => {
    const auth = await mwa.authorize({ cluster: 'mainnet-beta', identity: { name: 'StakeStreak', uri: 'https://stakestreak.ochinimus.app', icon: 'favicon.ico' } });
    const payer = new PK(Buffer.from(auth.accounts[0].address, 'base64'));
    payerAddr = payer.toBase58();
    const { blockhash } = await connection.getLatestBlockhash();
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: payer });
    tx.add(SystemProgram.transfer({ fromPubkey: payer, toPubkey: new PK(treasuryAddress), lamports: Math.round(amountSol * 1e9) }));
    const signed = await mwa.signTransactions({ transactions: [tx] });
    return await connection.sendRawTransaction(signed[0].serialize());
  });
  await connection.confirmTransaction(sig, 'confirmed');
  if (payerAddr) await AsyncStorage.setItem('walletAddress', payerAddr);
  return { sig, payer: payerAddr };
}


// v2: on-chain check-in. Sends a tiny proof transfer to treasury, returns sig.
export const CHECKIN_LAMPORTS = 5000;
export async function checkinTx(treasuryAddress) {
  const {SystemProgram, Transaction, PublicKey: PK} = require('@solana/web3.js');
  let payerAddr = null;
  const sig = await transact(async (mwa) => {
    const auth = await mwa.authorize({ cluster: 'mainnet-beta', identity: { name: 'StakeStreak', uri: 'https://stakestreak.ochinimus.app', icon: 'favicon.ico' } });
    const payer = new PK(Buffer.from(auth.accounts[0].address, 'base64'));
    payerAddr = payer.toBase58();
    const { blockhash } = await connection.getLatestBlockhash();
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: payer });
    tx.add(SystemProgram.transfer({ fromPubkey: payer, toPubkey: new PK(treasuryAddress), lamports: CHECKIN_LAMPORTS }));
    const signed = await mwa.signTransactions({ transactions: [tx] });
    return await connection.sendRawTransaction(signed[0].serialize());
  });
  await connection.confirmTransaction(sig, 'confirmed');
  if (payerAddr) await AsyncStorage.setItem('walletAddress', payerAddr);
  return { sig, payer: payerAddr };
}