# Tonora Architecture

Tonora is designed as a **client-side only** Progressive Web App (PWA). The core philosophy is to provide a rich musical experience (Play, Learn, Compose) using built-in web technologies without relying on external libraries or servers.

## Core Pillars
1. **Web Audio API**: All sounds are synthesized locally. No heavy `.mp3` or `.wav` sample files are loaded.
   - Piano / Synth: `OscillatorNode` with custom ADSR envelopes.
   - Guitar: Karplus-Strong string synthesis via `AudioBufferSourceNode` noise bursts filtered through delays, plus a `WaveShaperNode` for heavy distortion.
   - Drumkit: White noise bursts and filtered oscillators.
2. **Web MIDI API**: Allows users to connect external hardware MIDI keyboards directly to their browser.
3. **Vanilla DOM**: UI rendering and interactions are handled by native DOM APIs for maximum performance and zero dependency overhead.

## Application Modules
The application is organized into distinct logical modules inside the `js/` directory:

- **`audio.js`**: The `AudioEngine` singleton. Manages the `AudioContext`, global effects (Reverb/Delay), compression, live recording (`MediaRecorder`), and offline rendering (`OfflineAudioContext`) for WAV export.
- **`play.js`**: The "Play" mode logic. Manages MIDI bindings, octave shifts, and the Arpeggiator.
- **`piano.js`**: Renders the SVG/HTML hybrid piano keyboard and tracks key press states.
- **`learn.js`**: The "Synthesia" style falling-note game. Runs a `requestAnimationFrame` loop on a `<canvas>` element for high-performance rendering of notes and particle effects.
- **`compose.js`**: The FL Studio-style step sequencer. Manages the multi-track matrix (Melody, Bass, Drums), Mixer panel, and playback timing logic (`setTimeout` loop).
- **`achievements.js`**: Tracks user milestones (gamification) and persists them to `localStorage`.
- **`i18n.js`**: Handles English and Persian (RTL) localization.

## Data Structure
- `data/instruments.json`: Defines the ADSR envelopes, waveform types, and base frequencies for all synthesized instruments.
- `data/songs.json`: Stores the note arrays used in the Learn mode.

## Storage
All user data (composed songs, achievements, settings) is stored purely in `localStorage`. Users can export their compositions as standard `.json` files to back them up or share them.
