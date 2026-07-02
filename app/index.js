import 'react-native-get-random-values';
import { TextEncoder, TextDecoder } from 'text-encoding';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

/**
 * @format
 */

import {AppRegistry} from 'react-native';
import messaging, {
  getMessaging,
  requestPermission,
  getToken,
  AuthorizationStatus,
  setBackgroundMessageHandler,
  onMessage,
} from '@react-native-firebase/messaging';
import notifee, {AndroidImportance} from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CHANNEL_ID = 'stakestreak-pots';

async function ensureChannel() {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'New Pots',
    importance: AndroidImportance.HIGH,
  });
}

async function displayFromRemote(remoteMessage) {
  const n = remoteMessage.notification || {};
  await ensureChannel();
  await notifee.displayNotification({
    title: n.title || 'StakeStreak',
    body: n.body || '',
    android: {channelId: CHANNEL_ID, pressAction: {id: 'default'}, smallIcon: 'ic_launcher'},
  });
}

// background/quit: display incoming FCM
setBackgroundMessageHandler(getMessaging(), async remoteMessage => {
  await displayFromRemote(remoteMessage);
});

// foreground: FCM won't auto-show, so we display via notifee
onMessage(getMessaging(), async remoteMessage => {
  await displayFromRemote(remoteMessage);
});

async function initNotifications() {
  try {
    const m = getMessaging();
    const authStatus = await requestPermission(m);
    const enabled = authStatus === AuthorizationStatus.AUTHORIZED || authStatus === AuthorizationStatus.PROVISIONAL;
    await notifee.requestPermission();
    await ensureChannel();
    if (enabled) {
      const token = await getToken(m);
      await AsyncStorage.setItem('fcmToken', token);
      console.log('FCM token saved:', token.slice(0, 20));
    }
  } catch (e) {
    console.log('FCM error:', e.message);
  }
}

initNotifications();
import App from './App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
