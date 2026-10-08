// rpc.js — the ONE place this app's Solana RPC endpoint is defined.
// The app ships no RPC key: rpc.ochinimus.app is an allowlisted proxy
// (seeker-rpc on the VPS) that holds the provider key server-side.
import {Connection} from '@solana/web3.js';

export const RPC_URL = 'https://rpc.ochinimus.app';

export const connection = new Connection(RPC_URL, 'confirmed');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Poll getSignatureStatuses until the tx is confirmed. Used instead of
// connection.confirmTransaction, which waits on a signatureSubscribe
// websocket that the proxy does not serve.
export async function waitForConfirmation(signature, {timeoutMs = 90000, intervalMs = 2000} = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let st = null;
    try {
      const {value} = await connection.getSignatureStatuses([signature]);
      st = value && value[0];
    } catch (_) {
      // transient RPC error: keep polling
    }
    if (st && st.err) throw new Error('Transaction failed on-chain.');
    if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) return st;
    await sleep(intervalMs);
  }
  throw new Error('Not confirmed yet. If your wallet shows it sent, reopen the app in a minute.');
}
