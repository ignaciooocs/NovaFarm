const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Las migraciones de Drizzle se generan como archivos .sql importados
// directamente (ver drizzle/migrations.js) — Metro necesita saber
// resolverlos como código fuente, no como asset binario.
config.resolver.sourceExts.push('sql');

// La implementación web de expo-sqlite usa SQLite compilado a WASM
// (wa-sqlite) — sin esto Metro no sabe resolver el import del .wasm al
// bundlear para --web.
config.resolver.assetExts.push('wasm');

module.exports = config;
