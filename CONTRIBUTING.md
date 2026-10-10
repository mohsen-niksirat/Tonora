# Contributing to Tonora

First off, thank you for considering contributing to Tonora! It's people like you that make Tonora a powerful browser-based music studio.

## How Can I Contribute?

### Reporting Bugs
This section guides you through submitting a bug report. Following these guidelines helps maintainers understand your report, reproduce the behavior, and find related reports.
- Use a clear and descriptive title.
- Describe the exact steps to reproduce the problem.
- Provide specific examples to demonstrate the steps.

### Suggesting Enhancements
- Use a clear and descriptive title for the issue.
- Provide a step-by-step description of the suggested enhancement.
- Explain why this enhancement would be useful to most users.

### Pull Requests
1. Fork the repo and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. If you've changed APIs or UI, update the documentation.
4. Ensure the test suite passes (run `npm test`).
5. Issue that pull request!

## Project Structure
Tonora is built with **zero external dependencies** using pure HTML, CSS, and Vanilla JavaScript.
- `index.html`: The main entry point.
- `js/`: Application logic (`audio.js` for Web Audio synthesis, `compose.js` for the sequencer, etc.).
- `css/`: Styling (`style.css`).
- `data/`: Configuration for instruments and preset songs.

**Note on Build Tools**: We intentionally do not use bundlers (Webpack, Vite, etc.) to keep the project structure fully transparent and easily modifiable.

## Code of Conduct
Please note that this project is released with a Contributor Code of Conduct. By participating in this project you agree to abide by its terms.
