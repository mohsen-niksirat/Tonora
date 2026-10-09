/* Tonora — i18n */
'use strict';

const I18N = {
  en: {
    play: 'Play', learn: 'Learn', compose: 'Compose',
    chooseSong: 'Choose a song', level: 'Level', start: 'Start',
    back: 'Back', listen: 'Listen', yourTurn: 'Your turn!',
    score: 'Score', combo: 'Combo', perfect: 'Perfect!', good: 'Good', miss: 'Miss',
    tempo: 'Tempo', save: 'Save', export: 'Export', import: 'Import',
    clear: 'Clear', track: 'Track', melody: 'Melody', drums: 'Drums', bass: 'Bass',
    settings: 'Settings', language: 'Language', theme: 'Theme', dark: 'Dark', light: 'Light',
    home: 'Home', wait: 'Get ready…', tapStart: 'Tap to start', loading: 'Loading…',
    audioPaused: 'Audio is paused by the browser — click anywhere to start it',
    // v2
    metronome: 'Metronome', speed: 'Speed', repeatAB: 'A–B repeat', next8: 'Repeat next 8',
    repeatOn: 'Loop on', repeatOff: 'Loop off',
    velocity: 'Velocity', exportWav: 'Export WAV', rendering: 'Rendering…',
    midi: 'MIDI', noMidi: 'No MIDI device', midiDevices: 'MIDI device',
    achievements: 'Achievements',
    ach_first_song: 'First Song Learned', ach_first_song_d: 'Finish a lesson',
    ach_combo100: 'Perfect Combo', ach_combo100_d: 'Reach a 100+ combo in one lesson',
    ach_composer: 'Composer', ach_composer_d: 'Save your first composition',
    ach_exporter: 'Exporter', ach_exporter_d: 'Export your first WAV',
    ach_midi: 'MIDI Master', ach_midi_d: 'Play a note via MIDI',
    ach_streak3: '3-Day Streak', ach_streak3_d: 'Play 3 days in a row',
    confirmClear: 'Clear all notes?', duration: 'Duration',
    playAgain: 'Play Again', nextSong: 'Next Song', octave: 'Octave'
  },
  fa: {
    play: 'اجرا', learn: 'آموزش', compose: 'آهنگسازی',
    chooseSong: 'یک آهنگ انتخاب کن', level: 'سطح', start: 'شروع',
    back: 'بازگشت', listen: 'گوش کن', yourTurn: 'نوبت تو!',
    score: 'امتیاز', combo: 'کمبو', perfect: 'عالی!', good: 'خوب', miss: 'از دست رفت',
    tempo: 'تمپو', save: 'ذخیره', export: 'خروجی', import: 'ورودی',
    clear: 'پاک کردن', track: 'تراک', melody: 'ملودی', drums: 'درام', bass: 'بیس',
    settings: 'تنظیمات', language: 'زبان', theme: 'پوسته', dark: 'تیره', light: 'روشن',
    home: 'خانه', wait: 'آماده شو…', tapStart: 'برای شروع بزن', loading: 'در حال بارگذاری…',
    audioPaused: 'صدا توسط مرورگر متوقف شده — برای شروع جایی کلیک کن',
    // v2
    metronome: 'مترونوم', speed: 'سرعت', repeatAB: 'تکرار A–B', next8: 'تکرار ۸ نت بعدی',
    repeatOn: 'حلقه روشن', repeatOff: 'حلقه خاموش',
    velocity: 'شدت صدا', exportWav: 'خروجی WAV', rendering: 'در حال رندر…',
    midi: 'میدی', noMidi: 'دستگاه میدی نیست', midiDevices: 'دستگاه میدی',
    achievements: 'دستاوردها',
    ach_first_song: 'اولین آهنگ', ach_first_song_d: 'یک درس را تمام کن',
    ach_combo100: 'کمبو عالی', ach_combo100_d: 'در یک درس کمبو ۱۰۰+ بگیر',
    ach_composer: 'آهنگساز', ach_composer_d: 'اولین آهنگت را ذخیره کن',
    ach_exporter: 'خروجی‌گیر', ach_exporter_d: 'اولین WAV را خروجی بگیر',
    ach_midi: 'استاد میدی', ach_midi_d: 'یک نت با میدی بزن',
    ach_streak3: '۳ روز پیاپی', ach_streak3_d: '۳ روز پشت هم اجرا کن',
    confirmClear: 'همه نت‌ها پاک شوند؟', duration: 'مدت',
    playAgain: 'تکرار درس', nextSong: 'آهنگ بعدی', octave: 'اکتاو'
  }
};

let _lang = localStorage.getItem('tonora-lang') ||
  ((navigator.language || '').startsWith('fa') ? 'fa' : 'en');

function t(key) { return (I18N[_lang] && I18N[_lang][key]) || I18N.en[key] || key; }
function getLang() { return _lang; }
function setLang(l) { _lang = l; localStorage.setItem('tonora-lang', l); document.documentElement.lang = l; document.documentElement.dir = l === 'fa' ? 'rtl' : 'ltr'; }
