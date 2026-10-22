/**
 * babel.config.js — la chaîne de traduction du code avant qu'il n'arrive sur le
 * téléphone. `babel-preset-expo` branche tout seul le plugin Reanimated /
 * Worklets quand la lib est installée : c'est lui qui permet aux animations de
 * tourner sur le thread graphique plutôt que sur le thread JavaScript.
 */
module.exports = function (api) {
  api.cache(true);
  return { presets: [['babel-preset-expo', { reanimated: true }]] };
};
