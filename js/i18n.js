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
    home: 'Home', wait: 'Get ready…', tapStart: 'Tap to start', loading: 'Loading…'
  },
  fa: {
    play: 'اجرا', learn: 'آموزش', compose: 'آهنگسازی',
    chooseSong: 'یک آهنگ انتخاب کن', level: 'سطح', start: 'شروع',
    back: 'بازگشت', listen: 'گوش کن', yourTurn: 'نوبت تو!',
    score: 'امتیاز', combo: 'کمبو', perfect: 'عالی!', good: 'خوب', miss: 'از دست رفت',
    tempo: 'تمپو', save: 'ذخیره', export: 'خروجی', import: 'ورودی',
    clear: 'پاک کردن', track: 'تراک', melody: 'ملودی', drums: 'درام', bass: 'بیس',
    settings: 'تنظیمات', language: 'زبان', theme: 'پوسته', dark: 'تیره', light: 'روشن',
    home: 'خانه', wait: 'آماده شو…', tapStart: 'برای شروع بزن', loading: 'در حال بارگذاری…'
  }
};

let _lang = localStorage.getItem('tonora-lang') ||
  ((navigator.language || '').startsWith('fa') ? 'fa' : 'en');

function t(key) { return (I18N[_lang] && I18N[_lang][key]) || I18N.en[key] || key; }
function getLang() { return _lang; }
function setLang(l) { _lang = l; localStorage.setItem('tonora-lang', l); document.documentElement.lang = l; document.documentElement.dir = l === 'fa' ? 'rtl' : 'ltr'; }
