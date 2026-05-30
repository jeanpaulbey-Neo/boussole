const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

// On surveille aussi ../shared pour réutiliser le moteur et les données fiscales
// (source de vérité unique partagée avec la PWA).
const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '..', 'shared');

const config = {
  watchFolders: [sharedRoot],
  resolver: {
    extraNodeModules: {
      '@shared': sharedRoot,
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
