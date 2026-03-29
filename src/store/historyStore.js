import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HISTORY_PATH = join(__dirname, '../../data/history.json');

const MAX_AUTO = 10;

// In-memory list, sorted by createdAt desc
let history = [];

// ---------------------------------------------------------------------------
// Load / Save
// ---------------------------------------------------------------------------

export async function loadHistory() {
    try {
        const raw = await readFile(HISTORY_PATH, 'utf8');
        history = JSON.parse(raw);
        console.log(`[historyStore] Loaded ${history.length} history entries`);
    } catch (err) {
        if (err.code === 'ENOENT') {
            history = [];
        } else {
            throw err;
        }
    }
}

async function persistHistory() {
    await mkdir(dirname(HISTORY_PATH), { recursive: true });
    await writeFile(HISTORY_PATH, JSON.stringify(history, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function getHistory() {
    return structuredClone(history);
}

export function getSnapshot(id) {
    const entry = history.find(e => e.id === id);
    return entry ? structuredClone(entry) : null;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export async function addAutoSnapshot(snapshot) {
    // Skip if identical to the most recent snapshot
    if (history.length > 0) {
        const last = history[0];
        if (JSON.stringify(last.snapshot) === JSON.stringify(snapshot)) return null;
    }

    const entry = {
        id:        randomUUID(),
        type:      'auto',
        name:      `auto-${new Date().toISOString()}`,
        createdAt: new Date().toISOString(),
        snapshot:  structuredClone(snapshot),
    };

    history.unshift(entry);

    // Keep only the last MAX_AUTO auto entries; named entries are never pruned
    const autoEntries = history.filter(e => e.type === 'auto');
    if (autoEntries.length > MAX_AUTO) {
        const toRemove = autoEntries.slice(MAX_AUTO);
        const removeIds = new Set(toRemove.map(e => e.id));
        history = history.filter(e => !removeIds.has(e.id));
    }

    await persistHistory();
    return structuredClone(entry);
}

export async function addNamedSnapshot(name, snapshot) {
    const entry = {
        id:        randomUUID(),
        type:      'named',
        name:      name.trim(),
        createdAt: new Date().toISOString(),
        snapshot:  structuredClone(snapshot),
    };
    history.unshift(entry);
    await persistHistory();
    return structuredClone(entry);
}

export async function deleteSnapshot(id) {
    const idx = history.findIndex(e => e.id === id);
    if (idx === -1) return false;
    history.splice(idx, 1);
    await persistHistory();
    return true;
}
