/* Tonora — Achievements: localStorage badge system */
'use strict';

const ACHIEVEMENTS = [
  { id: 'first_song', icon: '🎓' },
  { id: 'combo100',   icon: '🔥' },
  { id: 'composer',   icon: '🎛️' },
  { id: 'exporter',   icon: '💾' },
  { id: 'midi',       icon: '🎹' },
  { id: 'streak3',    icon: '📅' }
];

const TonoraAchievements = {
  KEY: 'tonora-achievements',

  getAll() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || {}; }
    catch (e) { return {}; }
  },

  isUnlocked(id) { return !!this.getAll()[id]; },

  unlock(id) {
    if (!ACHIEVEMENTS.some(a => a.id === id)) return;
    const all = this.getAll();
    if (all[id]) return;
    all[id] = Date.now();
    localStorage.setItem(this.KEY, JSON.stringify(all));
    // lightweight toast
    const def = ACHIEVEMENTS.find(a => a.id === id);
    const name = t('ach_' + id);
    const toast = document.createElement('div');
    toast.className = 'ach-toast';
    toast.innerHTML = `<span class="big">${def.icon}</span> ${name}!`;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 30);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 2600);
  },

  /* day streak: any mode visit counts */
  touchStreak() {
    const today = new Date().toDateString();
    const days = JSON.parse(localStorage.getItem('tonora-days') || '[]');
    if (days[days.length - 1] === today) return;
    days.push(today);
    while (days.length > 3) days.shift();
    localStorage.setItem('tonora-days', JSON.stringify(days));
    if (days.length === 3) {
      const d1 = new Date(days[0]), d2 = new Date(days[1]), d3 = new Date(days[2]);
      const diff1 = Math.round((d2 - d1) / 86400000);
      const diff2 = Math.round((d3 - d2) / 86400000);
      if (diff1 === 1 && diff2 === 1) this.unlock('streak3');
    }
  },

  renderGrid(container) {
    container.innerHTML = '';
    const all = this.getAll();
    const h = document.createElement('h2');
    h.textContent = '🏅 ' + t('achievements');
    container.appendChild(h);
    const grid = document.createElement('div');
    grid.className = 'ach-grid';
    ACHIEVEMENTS.forEach(a => {
      const un = !!all[a.id];
      const b = document.createElement('div');
      b.className = 'ach-badge' + (un ? ' unlocked' : '');
      b.title = (t('ach_' + a.id) + ' — ' + t('ach_' + a.id + '_d'));
      b.innerHTML = `<span class="ico">${a.icon}</span><small>${t('ach_' + a.id)}</small>`;
      grid.appendChild(b);
    });
    container.appendChild(grid);
  }
};
