# 🎹 Tonora

**Play · Learn · Compose — all in your browser.**

Tonora is a client-side music studio: play virtual instruments, learn famous songs with falling notes, and compose your own multi-track pieces. No server, no accounts — everything runs locally.

**▶ Try it:** https://mohsen-niksirat.github.io/tonora/

## Features
- 🎹 **Play** — Piano, Guitar (Karplus–Strong), Synth, Music Box & Drums. Touch, mouse and PC keyboard support.
- 🎓 **Learn** — Falling-note lessons (like Synthesia) with scoring, combos and 3 difficulty levels.
- 🎛️ **Compose** — Multi-track step sequencer (melody / bass / drums), tempo control, save to local storage, import/export songs as JSON.
- 🌐 Bilingual (English / فارسی) with RTL support.
- 📱 Installable PWA — works fully offline.
- 🔊 100% Web Audio synthesis — zero audio files, tiny payload.

## Adding content (no code needed)
Content is data-driven — just edit the JSON files:

- **New instrument** → `data/instruments.json`
- **New song** → `data/songs.json` (format: `{"n": "C4", "t": beat, "d": beats}`)

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
