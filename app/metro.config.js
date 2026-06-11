const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const path = require('path');

const config = {
  resolver: {
    extraNodeModules: {
      '@solana-mobile/mobile-wallet-adapter-protocol/encoding': path.resolve(__dirname, 'node_modules/@solana-mobile/mobile-wallet-adapter-protocol/encoding.js'),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
