import axios from 'axios';

// DEV: Mac local IP so the Seeker phone can reach it over WiFi.
// Replace 192.168.x.x with your Mac IP before testing on device.
const BASE_URL = 'http://167.233.69.154/stakestreak';

const api = axios.create({ baseURL: BASE_URL, timeout: 10000 });

export const createPot = (creator, stakeSol, durationDays) =>
  api.post('/pot', { creator, stakeSol, durationDays }).then(r => r.data);

export const joinPot = (potId, wallet, sig) =>
  api.post('/pot/' + potId + '/join', { wallet, sig }).then(r => r.data);

export const startPot = (potId, wallet) =>
  api.post('/pot/' + potId + '/start', { wallet }).then(r => r.data);

export const checkinPot = (potId, wallet) =>
  api.post('/pot/' + potId + '/checkin', { wallet }).then(r => r.data);

export const buyFreeze = (potId, wallet, sig) =>
  api.post('/pot/' + potId + '/freeze', { wallet, sig }).then(r => r.data);

export const getPot = (potId) =>
  api.get('/pot/' + potId).then(r => r.data);

export const refundPot = (potId, wallet) =>
  api.post('/pot/' + potId + '/refund', { wallet }).then(r => r.data);
