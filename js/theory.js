/* Tonora — Theory mode: Sight Reading with VexFlow and Tonal.js. */
'use strict';

const TheoryMode = {
  piano: null,
  clef: 'treble',
  currentNote: null,
  score: 0,
  streak: 0,

  enter(root) {
    this.score = 0;
    this.streak = 0;
    root.innerHTML = `
      <div class="theory-stage" id="theory-stage" style="display:flex; flex-direction:column; align-items:center; flex:1; gap: 1rem; padding: 2rem;">
        <div class="theory-hud" style="display:flex; justify-content:space-between; width:100%; max-width:600px;">
          <h2>${t('theory')} - Sight Reading</h2>
          <div style="font-size: 1.2rem; font-weight: bold; color: var(--accent);">Score: <span id="th-score">0</span> 🔥 <span id="th-streak">0</span></div>
        </div>
        <div id="vex-container" style="background: var(--card); border: 1px solid rgba(255,255,255,0.1); border-radius: 1rem; padding: 1rem; margin-bottom: 2rem;"></div>
        <div id="theory-piano" style="width: 100%; max-width: 800px;"></div>
      </div>
    `;

    // Initialize Piano
    const pContainer = document.getElementById('theory-piano');
    this.piano = new Piano(pContainer, 3);
    this.piano.onPress = (n) => this.checkNote(n);

    this.nextNote();
  },

  nextNote() {
    const VF = Vex.Flow;
    const container = document.getElementById('vex-container');
    container.innerHTML = '';
    
    const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
    renderer.resize(250, 150);
    const context = renderer.getContext();
    context.setFont("Arial", 10, "").setBackgroundFillStyle("#eed");
    
    // Create stave
    const stave = new VF.Stave(20, 20, 200);
    stave.addClef(this.clef).addTimeSignature("4/4");
    
    // Check if dark mode is active to color lines/notes
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const color = isDark ? '#eef1ff' : '#1a2038';
    
    stave.setContext(context);
    stave.setConfigForLines(stave.getConfigForLines().map(l => Object.assign(l, { color })));
    context.setFillStyle(color);
    context.setStrokeStyle(color);
    stave.draw();

    // Generate random note between C3 and B4
    const notes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const rndNote = notes[Math.floor(Math.random() * notes.length)];
    const oct = Math.random() > 0.5 ? 3 : 4;
    this.currentNote = rndNote + oct;

    // VexFlow note format: "c/4"
    const vfNoteStr = rndNote.toLowerCase() + '/' + oct;

    const vfNote = new VF.StaveNote({ clef: this.clef, keys: [vfNoteStr], duration: "q" });
    vfNote.setStyle({ fillStyle: color, strokeStyle: color });
    const voice = new VF.Voice({ num_beats: 1, beat_value: 4 });
    voice.addTickables([vfNote]);

    const formatter = new VF.Formatter().joinVoices([voice]).format([voice], 150);
    voice.draw(context, stave);
  },

  checkNote(playedNote) {
    // Remove sharp/flat mapping complexity for now (basic white keys)
    if (playedNote === this.currentNote) {
      this.score += 10 + (this.streak * 2);
      this.streak++;
      document.getElementById('th-score').textContent = this.score;
      document.getElementById('th-streak').textContent = this.streak;
      
      const p = this.piano.svg.querySelector(`[data-note="${playedNote}"]`);
      if (p) {
        p.style.fill = 'var(--good)';
        setTimeout(() => { p.style.fill = ''; }, 300);
      }
      
      const def = window.TONORA_INSTRUMENTS.find(i => i.id === 'piano');
      window.TonoraAudio.playNote(def, playedNote, 0.5, 0.8);
      
      setTimeout(() => this.nextNote(), 500);
    } else {
      this.streak = 0;
      document.getElementById('th-streak').textContent = this.streak;
      const def = window.TONORA_INSTRUMENTS.find(i => i.id === 'piano');
      window.TonoraAudio.playNote(def, playedNote, 0.3, 0.5); // weak sound for miss
    }
  },

  leave() {
    if (this.piano) {
      this.piano.destroy();
      this.piano = null;
    }
  }
};
window.TheoryMode = TheoryMode;
