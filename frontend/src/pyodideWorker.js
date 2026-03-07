/**
 * pyodideWorker.js — WebWorker that loads Pyodide (CPython via WebAssembly)
 * and executes the custom math solver on the client's local CPU.
 *
 * Communication Protocol:
 *   Main Thread → Worker:  { type: 'SOLVE', payload: <JSON string> }
 *   Worker → Main Thread:  { type: 'RESULT', result: <parsed JSON> }
 *                          { type: 'ERROR', error: <string> }
 *                          { type: 'STATUS', message: <string> }
 */

/* global importScripts, loadPyodide */

let pyodide = null;
let solverLoaded = false;

async function initPyodide() {
    // Load Pyodide from CDN
    self.postMessage({ type: 'STATUS', message: 'Loading Python runtime...' });
    importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js');
    pyodide = await loadPyodide();
    self.postMessage({ type: 'STATUS', message: 'Python runtime ready. Loading solver...' });

    // Fetch the solver.py from the public directory
    const response = await fetch('/solver.py');
    const solverCode = await response.text();

    // Execute the solver module to define functions in Pyodide's namespace
    pyodide.runPython(solverCode);
    solverLoaded = true;
    self.postMessage({ type: 'STATUS', message: 'Solver engine loaded. Ready for computation.' });
}

// Start initialization immediately when worker is created
const initPromise = initPyodide().catch(err => {
    self.postMessage({ type: 'ERROR', error: `Failed to initialize Pyodide: ${err.message}` });
});

self.onmessage = async (event) => {
    const { type, payload } = event.data;

    if (type === 'SOLVE') {
        try {
            // Wait for Pyodide to finish loading if it hasn't yet
            await initPromise;

            if (!solverLoaded) {
                throw new Error('Solver engine not initialized');
            }

            self.postMessage({ type: 'STATUS', message: 'Running computation on local CPU...' });

            // Pass the JSON payload to the Python solver
            const payloadJson = JSON.stringify(payload);

            // Call the Python entry point
            const resultJson = pyodide.runPython(`run_solver('''${payloadJson.replace(/\\/g, '\\\\').replace(/'''/g, "\\'\\'\\'")}''')`);

            const result = JSON.parse(resultJson);
            self.postMessage({ type: 'RESULT', result });

        } catch (err) {
            self.postMessage({ type: 'ERROR', error: err.message || String(err) });
        }
    }
};
