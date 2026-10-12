# 🎹 Tonora

**Play · Learn · Compose — all in your browser.**

Tonora is a client-side music studio: play virtual instruments, learn famous songs with falling notes, and compose your own multi-track pieces. No server, no accounts — everything runs locally.

**▶ Try it:** https://mohsen-niksirat.github.io/tonora/
**🇮🇷 [نسخه فارسی](README-fa.md)**

## Features
- 🎹 **Play** — Piano, Guitar (Karplus–Strong), Synth, Music Box, Flute (FM), Celesta & Drums. Touch, mouse and PC keyboard support.
- 🎛️ **Web MIDI** — connect a MIDI keyboard in Play mode; notes map straight to the selected instrument (device picker appears automatically when a MIDI device is found).
- 🎓 **Learn** — Falling-note lessons (like Synthesia) with scoring, combos and 3 difficulty levels. Practice tools:
  - 🥁 **Metronome** — click on every beat, togglable.
  - ⏱️ **Speed** — 0.5× / 1× toggle; scoring windows scale automatically.
  - 🔁 **A–B repeat** — loop the next 8 notes until you nail them.
- 🎼 **Compose** — Multi-track step sequencer (melody / bass / drums) with **chords** (stack several notes on one step), **velocity** slider (0.4–1.0), tempo control, save to local storage, import/export songs as JSON.
- 💾 **WAV export** — render your composition offline and download `tonora-composition.wav` (16-bit PCM, plays anywhere).
- 🏅 **Achievements** — 7 badges (First Song, 100+ Combo, Composer, Exporter, MIDI Master, Theory Student, 3-Day Streak) shown on the home screen, persisted in localStorage.
- 🌐 Bilingual (English / فارسی) with RTL support.
- 📱 Installable PWA — works fully offline.
- 🔊 100% Web Audio synthesis — zero audio files, tiny payload.

## Changelog

### v7.2 (The Power Tools Update) — Transpose & Multi-select Copy/Paste
- ♯♭ **Project Transpose** — shift every melody and bass note by −12 to +12 semitones from the ♯♭ menu (naturals use sharps going up, flats going down; notes that would leave the MIDI range are kept safe). Fully undoable.
- 📋 **Multi-select Copy/Paste in Piano-roll** — Ctrl/Cmd-click or Shift-click notes to select several at once, `Ctrl+C` / `Ctrl+V` to duplicate them, `Delete` to clear the selection. Pasted notes keep their lengths and are pre-selected for quick moves.

### v7.1 (The Pro Edit Update) — Piano-roll, Pattern Chaining & Practice Insights
- 🎼 **True Piano-roll** — toggle 🎼 Roll in Compose for a chromatic C3–B5 editor: click to place a note, drag its right edge to stretch the length (1–8 steps), right-click to erase. Note lengths persist through undo, save, share, and MIDI/WAV export.
- ⛓ **Pattern Chaining** — snapshot the current pattern as named sections (S1, S2, …) in the ⛓ panel, then play them back-to-back with Chain mode on. Great for verse/chorus structures. Sections are saved inside projects.
- 📊 **Practice Insights** — the lesson summary now shows per-bar accuracy bars and a 🎯 Weakest Bar button that instantly loops the hardest section via A–B repeat.

### v7.0 (The Studio Update) — Offline PWA, Capture, Share & Groove
- 🌐 **Fully Offline PWA** — abcjs and tonal now ship as local vendor bundles, so Theory and notation work with no internet. Everything is in the service-worker cache.
- 🎙️ **Play → Compose Capture** — the new ● Tape button in Play mode records your live performance with timing and drops it quantized into the sequencer as an editable pattern.
- 📊 **Velocity Lane** — a per-step accent lane in Compose (toggle 📊 VEL) that drives live playback, WAV export, and MIDI export — real dynamics, not just a global slider.
- 🕺 **Groove Presets** — one-click feels (Straight, Shuffle, Deep Swing, Loose, Tight) that combine swing and humanize timing.
- 🔗 **Share via URL** — the 🔗 button copies a `#compose?s=…` link that encodes your whole song in the URL. Anyone who opens it gets your composition — no server needed.
- ⏸️ **Wait Mode (Synthesia-style)** — in Learn mode the timeline freezes at the next note until you play it; perfect for hands-on practice.
- 🎯 **Daily Challenge** — a date-seeded daily song card in Learn with a done state, plus a local streak feel.
- 🎵 **5 Drum Groove Presets** — Rock, Hip-Hop, Four-on-the-Floor, Persian 6/8, and Rap/Trap rhythm patterns.
- 🎹 **21 Songs** — 10 new lessons including 4 Iranian classics (Morgh-e Sahar, Ey Iran, Sultane Ghalbha, Jane Maryam) and 6 more classical pieces.
- 📦 **IndexedDB Projects** — compositions now store in IndexedDB with automatic migration from localStorage (with a safe fallback).
- 🛠️ **`npm run bump`** — a version-bump script updates every `?v=` cache-buster and the service-worker cache name in one step.

### v6.0 (The Masterpiece Update) — Arpeggiator, Neon Glow & Delay FX
- 🎶 **Arpeggiator** — added an Arp button in Play mode. Hold down a chord and watch the arpeggiator cycle through the notes automatically (perfect for synthwave).
- 🔁 **Global Delay FX** — introduced a ping-pong Delay slider to the master effects rack (works in both live play and WAV export).
- 📏 **Dynamic Pattern Length** — the Compose mode sequencer is no longer locked to 32 steps! You can now choose between 16, 32, and 64 steps for longer or shorter phrases.
- ✨ **Neon Glow & Mesh Graphics** — hitting piano keys now triggers a gorgeous neon box-shadow glow. The home screen features a premium, animated mesh gradient background.

### v5.0 (DAW Edition) — Channel Rack, Mixer Console, Stereo Panning
- 🎚️ **Mixer Console** — added a real-time track mixer to Compose mode with independent Volume and Stereo Panning (Left/Right) sliders for Melody, Bass, and Drums (works in both live playback and offline WAV export).
- 🥁 **Multi-Track Drum Rack** — the single drum line in Compose mode has been exploded into a true Channel Rack (Kick, Snare, Hi-hat), allowing for complex beat programming like FL Studio.
- 🎨 **Sequencer UI Overhaul** — steps are now styled and color-coded in groups of 4 (classic FL Studio aesthetic) for better beat visibility.

### v4.0 (The Ultimate Edition) — E-Guitar, Swing rhythm, Particles & Reverb control
- 🎸 **Electric Guitar (Distortion)** — brand new instrument (`eguitar`) using `WaveShaperNode` for heavy, saturated overdrive tones.
- 🎵 **Swing Rhythm in Sequencer** — added a "Swing" toggle in Compose mode, adding a humanized, lopsided groove to your drum beats and melodies (affects both live playback and WAV export).
- ✨ **Particle Visual Effects** — hitting the correct keys in Learn mode now spawns dynamic, physics-based particles (Golden for Perfect, Green for Good) that fall across the screen.
- 🌊 **Global Reverb Slider** — easily adjust the spatial acoustic echo of the entire app with a new real-time slider in the top header.

### v3.1 — live jam recorder, header visualizer, Setar & keyboard shortcuts modal
- ⏺️ **Live Jam Session Recorder** — record your freeform performances, drum beats, and keyboard jams in real-time with one click; downloads directly as high-fidelity WebM audio.
- 📊 **Real-time Audio Visualizer** — sleek frequency visualizer canvas in the top header reacting dynamically to every note, chord, and drum played.
- 🪕 **Setar Instrument** — authentic Persian classical stringed instrument synthesized via high-damping Karplus–Strong physical modeling.
- 🎶 **Tavallod Song** — added Anoushiravan Rohani's iconic celebration melody ("تولدت مبارک") to Learn mode lessons.
- ⌨️ **Keyboard Shortcuts Modal** — added header shortcuts cheat sheet button (`⌨️`) mapping PC keys across both lower and higher octaves.

### v3.0 — studio master limiter, sustain pedal, presets & lesson summary
- 🛡️ **Broadcast Master Limiter** — integrated studio-grade DynamicsCompressorNode across live output and offline WAV rendering to prevent digital clipping under dense polyphony.
- 🔊 **Master Volume Control** — global volume slider in header with localStorage persistence.
- 🎻 **New Instruments** — added lush Strings (sawtooth ensemble) and Church Organ with classical harmonic drawbars.
- 🦶 **Sustain Pedal** — full sustain pedal support in Play mode via UI toggle and PC Spacebar hold.
- ⚡ **Skip to Play** — Learn mode listen phase now includes a "Skip to Play" button to jump straight into practice.
- 📊 **Lesson Summary Modal** — interactive completion card displaying Stars, Final Score, Accuracy %, Max Combo, with one-click "Play Again" and "Next Song".
- ✨ **Sequencer Presets & Mute** — Pop Groove, Synthwave, and Lofi Chill built-in templates with individual track mute toggles (Melody, Drums, Bass).

### v2.2 — piano keyboard overhaul, octave shifter, practice & sequencer enhancements
- 🎹 **Complete 24-key chromatic piano** — all 10 black keys (C#, D#, F#, G#, A# across both octaves) correctly generated and aligned pixel-perfect at white key boundaries.
- 🎛️ **Live Octave Shifter** — easily switch between octaves (C2–B3, C3–B4, C4–B5) with the new header controls in Play mode.
- ⌨️ **PC Keyboard Hints** — piano keys display computer keyboard shortcuts with 2 full octaves of comfortable mapping.
- 🎓 **Fixed Learn Mode Listen Audio** — notes are now scheduled precisely on beat using `scheduleNote`, with instant voice cancellation on exit.
- 🏆 **High Score Tracking** — tracks and displays your best scores per song with badges directly on lesson cards.
- 🎼 **Step Sequencer Enhancements** — clear 4-beat visual separators, live duration badge (`⏱ 4.0s`), playhead pause state, and safe clear confirmation.
- 🔊 **Lush Acoustic Reverb** — high-frequency noise absorption filter in procedural impulse response for natural hall acoustics.
- 🎛️ **MIDI Crash Fix** — resolved instrument lookup bug when triggering notes via external MIDI keyboards.

### v2.1 — audio stability & performance
- 🔧 **Fixed the Guitar voice** — the old Karplus–Strong loop could self-oscillate (harsh metallic ring) and take down all app audio. Now a proper plucked string: lowpass-filtered noise seed, Q = 0.5 damping filter, 0.992 feedback → warm pluck that decays in ~2–4 s.
- 🔊 **Audio auto-revival** — Chrome can suspend the AudioContext mid-session (autoplay policy). A document-level gesture listener (re-armed on every mode switch) resumes it on the next click/keypress; if audio is requested while suspended, a toast appears ("click anywhere to start audio") instead of silent death. Context state changes log to `console.debug`.
- ⚡ **Perf** — Learn mode caches piano-key geometry (no per-frame layout thrash); Compose playback highlights the step column in O(1) DOM work instead of clearing the whole grid each tick.
- 🥁 **MIDI drums** — only GM drum notes 36–47 map onto pads; other notes are ignored instead of wrapping around.

## Adding content (no code needed)
Content is data-driven — just edit the JSON files:

- **New instrument** → `data/instruments.json` (types: `additive`, `subtractive`, `karplus`, `fm`, `celesta`, `drumkit`)
- **New song** → `data/songs.json` (format: `{"n": "C4", "t": beat, "d": beats}`)

Composed songs export/import as JSON; old single-note files remain compatible — chords are stored as arrays (`["C4","E4","G4"]`).

## Run locally
```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy to GitHub Pages
1. Push these files to the `main` branch of your `tonora` repo.
2. Repo → Settings → Pages → Source: `main` / root.

## Tech
Vanilla HTML/CSS/JS · Web Audio API · IndexedDB/LocalStorage · Service Worker. No build step, no dependencies.

## License
MIT
