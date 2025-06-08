# BPM Detector

This project tracks beats from audio files. It uses the Web Audio API to analyze audio and detect tempo in real time. Development is handled with [Vite](https://vitejs.dev/).

## Running the development server

Install dependencies and start the server:

```sh
npm install
npm run dev
```

Vite will launch a local server (usually at http://localhost:5173/) where you can interact with the application.

## Browser requirements

A modern browser with Web Audio API support (e.g. current versions of Chrome, Edge, or Firefox) is required for beat tracking.

## Debugging

Any debugging logs should be stored in the `logs/` directory, which is listed in `.gitignore` so it isn't committed. Create the directory if it doesn't exist:

```sh
mkdir -p logs
```

Log files placed here will be ignored by Git.
