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
} from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';

async function requestNotificationPermission() {
  try {
    const m = getMessaging();
    const authStatus = await requestPermission(m);
    const enabled = authStatus === AuthorizationStatus.AUTHORIZED || authStatus === AuthorizationStatus.PROVISIONAL;
    if (enabled) {
      const token = await getToken(m);
      await AsyncStorage.setItem('fcmToken', token);
      console.log('FCM token saved:', token.slice(0, 20));
    }
  } catch (e) {
    console.log('FCM error:', e.message);
  }
}

requestNotificationPermission();
import App from './App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
