module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Las migraciones de Drizzle se importan como archivos .sql (ver
    // drizzle/migrations.js) — este plugin los inlinea como string antes de
    // que Babel intente parsear su contenido como JS.
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
