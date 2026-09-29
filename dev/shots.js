/*
 * Retake every screenshot in `media/` from the preview.
 *
 *     npm run preview -- --no-open --port 8105     # in one shell
 *     npm run shots                                # in another
 *
 * **The recipes live here, not in a person's shell history.** A stale
 * screenshot is a documented claim about a version that no longer exists, and
 * the only defence is a retake cheap enough to run on every release. The
 * pictures through 0.3.x were taken by hand; this is `pcf-row-commands`'
 * script, pointed at `dev/preview.html`, whose URL switches reach every state
 * the board has — so a recipe here is a query string, plus a drag where one is
 * needed.
 *
 * Headless Chrome over the DevTools protocol with Node's own `WebSocket` — no
 * dependency. At device scale 2, the width the published pictures have.
 */

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const media = path.join(root, 'media');

const CHROME = process.env.CHROME || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((candidate) => fs.existsSync(candidate));

const PORT = process.env.PORT || 8105;
const BASE = `http://localhost:${PORT}/dev/preview.html`;
const DEBUG_PORT = 9338;
const WIDTH = 1164;

/** name, what it is for, the preview's query string, and anything to do once it has rendered. */
const SHOTS = [
    ['screenshot-board.png', 'the demo board: lanes from the option set, a sum under each, what the sums are over',
        'fixture=demo&view=1&lane=212', ''],
    ['screenshot-search.png', 'the search narrowing every lane by title, assignee or badge — "dana" finds two cards by their assignee',
        'fixture=demo&view=1&lane=212&search=dana', ''],
    ['screenshot-totals.png', 'Lane total over a paged board: the view\'s sums, "1 of 3" where more are counted than loaded',
        'fixture=demo&view=1&lane=212&page=5', ''],
    ['screenshot-limits.png', 'Lane limits: Active over its limit of two, New at its limit of three',
        'fixture=demo&view=1&lane=212&limits=2%3D2,1%3D3', ''],
];

if (!CHROME) {
    console.error('\n  No Chrome found. Set CHROME to its path.\n');
    process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function json(url) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        try {
            const response = await fetch(url);

            if (response.ok) {
                return await response.json();
            }
        } catch {
            // Not listening yet.
        }

        await sleep(200);
    }

    throw new Error(`Nothing answered at ${url}.`);
}

function connect(url) {
    const socket = new WebSocket(url);
    const waiting = new Map();
    let next = 0;

    socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        const pending = waiting.get(message.id);

        if (pending) {
            waiting.delete(message.id);
            message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
        }
    });

    return new Promise((resolve, reject) => {
        socket.addEventListener('error', reject);
        socket.addEventListener('open', () =>
            resolve({
                send(method, params = {}) {
                    next += 1;
                    socket.send(JSON.stringify({ id: next, method, params }));

                    return new Promise((ok, fail) => waiting.set(next, { resolve: ok, reject: fail }));
                },
                close() {
                    socket.close();
                },
            }),
        );
    });
}

async function evaluate(cdp, expression) {
    const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
    });

    if (exceptionDetails) {
        throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    }

    return result.value;
}

(async () => {
    try {
        await fetch(BASE);
    } catch {
        console.error(`\n  The preview is not being served at ${BASE}.\n  Run npm run preview -- --no-open --port ${PORT} first.\n`);
        process.exit(1);
    }

    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pcf-shots-'));
    const browser = spawn(CHROME, [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        `--remote-debugging-port=${DEBUG_PORT}`,
        `--user-data-dir=${profile}`,
        'about:blank',
    ], { stdio: 'ignore' });

    try {
        const targets = await json(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
        const page = targets.find((target) => target.type === 'page');
        const cdp = await connect(page.webSocketDebuggerUrl);

        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: WIDTH + 32, height: 1200, deviceScaleFactor: 2, mobile: false });

        for (const [name, purpose, query, after] of SHOTS) {
            await cdp.send('Page.navigate', { url: `${BASE}?width=${WIDTH}&${query}` });
            // The option set, the totals and the search all arrive through effects.
            await sleep(1500);

            if (after) {
                await evaluate(cdp, `(async () => { ${after} })()`);
                await sleep(600);
            }

            const clip = await evaluate(cdp, `(() => {
                const box = document.querySelector('.KanbanBoard').getBoundingClientRect();
                return { x: Math.max(0, box.left - 8), y: Math.max(0, box.top + window.scrollY - 8), width: Math.ceil(box.width + 16), height: Math.ceil(box.height + 16), scale: 1 };
            })()`);
            const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true });

            fs.writeFileSync(path.join(media, name), Buffer.from(shot.data, 'base64'));
            console.log(`  ${name.padEnd(24)} ${clip.width * 2}×${clip.height * 2}  ${purpose}`);
        }

        cdp.close();
    } finally {
        browser.kill();
    }
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
