# 🎹 Tonora

**Play · Learn · Compose — all in your browser.**

Tonora is a client-side music studio: play virtual instruments, learn famous songs with falling notes, and compose your own multi-track pieces. No server, no accounts — everything runs locally.

**▶ Try it:** https://mohsen-niksirat.github.io/tonora/

## Features
- 🎹 **Play** — Piano, Guitar (Karplus–Strong), Synth, Music Box, Flute (FM), Celesta & Drums. Touch, mouse and PC keyboard support.
- 🎛️ **Web MIDI** — connect a MIDI keyboard in Play mode; notes map straight to the selected instrument (device picker appears automatically when a MIDI device is found).
- 🎓 **Learn** — Falling-note lessons (like Synthesia) with scoring, combos and 3 difficulty levels. Practice tools:
  - 🥁 **Metronome** — click on every beat, togglable.
  - ⏱️ **Speed** — 0.5× / 1× toggle; scoring windows scale automatically.
  - 🔁 **A–B repeat** — loop the next 8 notes until you nail them.
- 🎼 **Compose** — Multi-track step sequencer (melody / bass / drums) with **chords** (stack several notes on one step), **velocity** slider (0.4–1.0), tempo control, save to local storage, import/export songs as JSON.
- 💾 **WAV export** — render your composition offline and download `tonora-composition.wav` (16-bit PCM, plays anywhere).
- 🏅 **Achievements** — 6 badges (First Song, 100+ Combo, Composer, Exporter, MIDI Master, 3-Day Streak) shown on the home screen, persisted in localStorage.
- 🌐 Bilingual (English / فارسی) with RTL support.
- 📱 Installable PWA — works fully offline.
- 🔊 100% Web Audio synthesis — zero audio files, tiny payload.

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
