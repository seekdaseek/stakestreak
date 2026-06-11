import React, {useState, useEffect} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import ConnectScreen from './src/screens/ConnectScreen';
import PotListScreen from './src/screens/PotListScreen';
import CreatePotScreen from './src/screens/CreatePotScreen';
import PotDetailScreen from './src/screens/PotDetailScreen';
import {getSavedWallet} from './src/services/wallet';

const Stack = createNativeStackNavigator();

export default function App() {
  const [ready, setReady] = useState(false);
  const [hasWallet, setHasWallet] = useState(false);

  useEffect(() => {
    getSavedWallet().then(w => { setHasWallet(!!w); setReady(true); });
  }, []);

  if (!ready) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={hasWallet ? 'PotList' : 'Connect'}
        screenOptions={{
          headerStyle: {backgroundColor: '#0d0d14'},
          headerTintColor: '#fff',
          contentStyle: {backgroundColor: '#0d0d14'},
        }}>
        <Stack.Screen name="Connect" component={ConnectScreen} options={{headerShown: false}} />
        <Stack.Screen name="PotList" component={PotListScreen} options={{title: 'StakeStreak'}} />
        <Stack.Screen name="CreatePot" component={CreatePotScreen} options={{title: 'New Pot'}} />
        <Stack.Screen name="PotDetail" component={PotDetailScreen} options={{title: 'Pot'}} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
