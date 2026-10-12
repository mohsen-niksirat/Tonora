'use strict';

/* Tonora runs as classic browser scripts (no bundler), so most symbols are
   globals shared across files. We lint for real mistakes (undefined refs,
   unreachable code, duplicate keys) while declaring the known globals. */
const projectGlobals = {
  // browser
  window: 'readonly', document: 'readonly', navigator: 'readonly', location: 'readonly',
  localStorage: 'readonly', sessionStorage: 'readonly', devicePixelRatio: 'readonly',
  requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  performance: 'readonly', console: 'readonly',
  fetch: 'readonly', caches: 'readonly', self: 'readonly',
  Blob: 'readonly', FileReader: 'readonly', URL: 'readonly', MediaRecorder: 'readonly',
  AudioContext: 'readonly', webkitAudioContext: 'readonly', OfflineAudioContext: 'readonly',
  alert: 'readonly', confirm: 'readonly', prompt: 'readonly',
  // node (tests / scripts / guarded exports)
  require: 'readonly', module: 'readonly', exports: 'readonly', process: 'readonly', __dirname: 'readonly',
  // app globals shared across scripts
  t: 'readonly', getLang: 'readonly', setLang: 'readonly', noteToFreq: 'readonly',
  PianoUI: 'readonly', TonoraAchievements: 'readonly', armAudioRevive: 'readonly',
  ComposeMode: 'readonly', LearnMode: 'readonly', PlayMode: 'readonly', TheoryMode: 'readonly',
  Vex: 'readonly', Tonal: 'readonly', ABCJS: 'readonly',
  buildMidiFile: 'readonly', midiToTracks: 'readonly', TonoraBacking: 'readonly',
  TonoraNotation: 'readonly', TonoraTheory: 'readonly', midiToNoteName: 'readonly'
};

module.exports = [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: projectGlobals
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': 'off',
      'no-redeclare': 'off',
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-dupe-else-if': 'error',
      'no-cond-assign': 'error',
      'no-constant-condition': 'off',
      'no-empty': 'off',
      'no-extra-semi': 'error'
    }
  },
  {
    ignores: ['node_modules/**', 'js/vendor/**', 'Tonora.zip']
  }
];
