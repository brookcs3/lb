# BPM Detector

This project tracks beats from audio files. It uses the Web Audio API to analyze audio and detect tempo in real time. Development is handled with [Vite](https://vitejs.dev/).
The user interface logic resides in `main.js`, which is loaded by `index.html`.

## Running the development server

Install dependencies and start the server:

```sh
npm install
npm run dev
```

Vite will launch a local server at http://localhost:3000/ where you can interact with the application.

## Building for production

To create an optimized bundle and preview the result:

```sh
npm run build        # create the production build in dist/
npm run preview      # serve the built files locally
```

## Browser requirements

A modern browser with Web Audio API support (e.g. current versions of Chrome, Edge, or Firefox) is required for beat tracking.

## Helper buttons

The UI exposes several shortcut buttons. After loading an audio file you can:

- **Quick Analyze** – run a lightweight beat tracker.
- **beat_track()** – call the exported `beat_track` helper.
- **tempo()** – call the exported `tempo` helper to estimate the global BPM.
- **PLP Analyze** – hidden advanced option. Reveal this button with the `?advanced=1`
  query string (or by holding **Alt** when the page has focus). It runs
  `tracker.plp` to estimate tempo and logs the pulse curve length for
  diagnostics.

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

## Python demo

An experimental Python script and notebook are provided in the
`plot_dynamic_beat/` directory. The demo replicates the dynamic beat
tracking logic using [librosa](https://librosa.org/). You will need
`librosa`, `matplotlib`, and `numpy` installed to run it:

```sh
pip install librosa matplotlib numpy
```

The script expects an audio sample named `snare-accelerate.ogg` inside an
`audio/` subdirectory. You can obtain this file from the Librosa examples
repository or substitute any short percussion recording of your own.


## License

This project is licensed under the ISC License. See [LICENSE](LICENSE) for details.
