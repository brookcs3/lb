# BPM Detector

This project tracks beats from audio files. It uses the Web Audio API to analyze audio and detect tempo in real time. Development is handled with [Vite](https://vitejs.dev/).

## Running the development server

Install dependencies and start the server:

```sh
npm install
npm run dev
```

Vite will launch a local server at http://localhost:3000/ where you can interact with the application.

## Browser requirements

A modern browser with Web Audio API support (e.g. current versions of Chrome, Edge, or Firefox) is required for beat tracking.

## Helper buttons

The UI exposes several shortcut buttons. After loading an audio file you can:

- **Quick Analyze** – run a lightweight beat tracker.
- **beat_track()** – call the exported `beat_track` helper.
- **tempo()** – call the exported `tempo` helper to estimate the global BPM.

These shortcuts make it easy to test the library without writing code.

## Debugging

Any debugging logs should be stored in the `logs/` directory, which is listed in `.gitignore` so it isn't committed. Create the directory if it doesn't exist:

```sh
mkdir -p logs
```

Log files placed here will be ignored by Git.

## Running tests

Unit tests use [Jest](https://jestjs.io/). Install dependencies and run:

```sh
npm install
npm test
```


## License

This project is licensed under the ISC License. See [LICENSE](LICENSE) for details.
