import React, {useState, useEffect} from 'react';
import {Text} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import ConnectScreen from './src/screens/ConnectScreen';
import PotListScreen from './src/screens/PotListScreen';
import CreatePotScreen from './src/screens/CreatePotScreen';
import PotDetailScreen from './src/screens/PotDetailScreen';
import HowItWorksScreen from './src/screens/HowItWorksScreen';
import MoreAppsScreen from './src/screens/MoreAppsScreen';
import {getSavedWallet} from './src/services/wallet';
import {ToastProvider} from './src/components/Toast';

const Stack = createNativeStackNavigator();

const linking = {
  prefixes: ['stakestreak://'],
  config: {
    screens: {
      PotList: {path: 'join', parse: {p: v => v}},
    },
  },
};

export default function App() {
  const [ready, setReady] = useState(false);
  const [hasWallet, setHasWallet] = useState(false);

  useEffect(() => {
    getSavedWallet().then(w => { setHasWallet(!!w); setReady(true); });
  }, []);

  if (!ready) return null;

  return (
    <ToastProvider>
    <NavigationContainer linking={linking}>
      <Stack.Navigator
        initialRouteName={hasWallet ? 'PotList' : 'Connect'}
        screenOptions={{
          headerStyle: {backgroundColor: '#1A1310'},
          headerTintColor: '#FFFFFF',
          headerTitleStyle: {fontWeight: '900'},
          contentStyle: {backgroundColor: '#1A1310'},
        }}>
        <Stack.Screen name="Connect" component={ConnectScreen} options={{headerShown: false}} />
        <Stack.Screen name="PotList" component={PotListScreen} options={({navigation}) => ({title: 'StakeStreak', headerRight: () => (
          <Text onPress={() => navigation.navigate('MoreApps')} style={{color: '#FF5A36', fontWeight: '800', fontSize: 14}}>More from dev</Text>
        )})} />
        <Stack.Screen name="CreatePot" component={CreatePotScreen} options={{title: 'New Pot'}} />
        <Stack.Screen name="PotDetail" component={PotDetailScreen} options={{title: 'Pot'}} />
        <Stack.Screen name="HowItWorks" component={HowItWorksScreen} options={{title: 'How it works'}} />
        <Stack.Screen name="MoreApps" component={MoreAppsScreen} options={{title: 'More apps'}} />
      </Stack.Navigator>
    </NavigationContainer>
    </ToastProvider>
  );
}
