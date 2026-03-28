import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, '../../data/bots.json');

const EMPTY_CONFIG = {
    defaults: {},
    nodes: {},
    consulates: {},
    bots: {},
    reservedDates: [],
};

// In-memory store — single source of truth at runtime
let store = structuredClone(EMPTY_CONFIG);

// ---------------------------------------------------------------------------
// Load / Save
// ---------------------------------------------------------------------------

export async function loadConfig() {
    try {
        const raw = await readFile(DATA_PATH, 'utf8');
        store = JSON.parse(raw);
        // Ensure all top-level keys exist even if the file is partial
        store.defaults    = store.defaults    ?? {};
        store.nodes       = store.nodes       ?? {};
        store.consulates  = store.consulates  ?? {};
        store.bots        = store.bots        ?? {};
        store.reservedDates = store.reservedDates ?? [];
        // One-time migration: move dateReservedForUser from defaults to reservedDates
        if (store.defaults.dateReservedForUser !== undefined) {
            store.reservedDates = store.defaults.dateReservedForUser;
            delete store.defaults.dateReservedForUser;
            await saveConfig();
            console.log('[configStore] Migrated dateReservedForUser from defaults → reservedDates');
        }
        console.log(`[configStore] Loaded config from ${DATA_PATH}`);
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log('[configStore] No existing bots.json — starting with empty config.');
            store = structuredClone(EMPTY_CONFIG);
        } else {
            throw err;
        }
    }
}

export async function saveConfig() {
    await mkdir(dirname(DATA_PATH), { recursive: true });
    await writeFile(DATA_PATH, JSON.stringify(store, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

export function getRawConfig() {
    return structuredClone(store);
}

// ---------------------------------------------------------------------------
// Resolve (merge) logic
// ---------------------------------------------------------------------------

/**
 * Filters dateReservedForUser (array format) for API consumers.
 * Returns { userId: dates[] } — stable API shape for bots.
 *
 * Storage format: Array<{ userId, dates, consulate, botId }>
 * Filtering: include entries whose consulate matches the request, or is empty (all consulates).
 *
 * @param {Array<{userId:string,dates:string[],consulate?:string,botId?:string}>} raw
 * @param {string|null} consulate - consulate from the bot query
 * @returns {Record<string, string[]>}
 */
function filterReservedDates(raw, consulate) {
    if (!Array.isArray(raw)) return {};
    const result = {};
    for (const entry of raw) {
        if (!entry.userId || !Array.isArray(entry.dates) || entry.dates.length === 0) continue;
        const matchesConsulate = !consulate || !entry.consulate || entry.consulate === consulate;
        if (matchesConsulate) {
            result[entry.userId] = entry.dates;
        }
    }
    return result;
}

/**
 * Merges the four config levels for a given bot.
 *
 * Priority (low → high): defaults → node → consulate → bot
 *
 * Special handling for `dateReservedForUser`:
 *   - The merged value is filtered by the requested consulate.
 *   - Returned as { userId: dates[] } regardless of internal storage format.
 *
 * @param {string} botId
 * @param {string|null} nodeId
 * @param {string|null} consulate
 * @returns {{ config: object, sources: { defaults: object, node: object, consulate: object, bot: object } }}
 */
export function resolveConfig(botId, nodeId, consulate) {
    const srcDefaults   = store.defaults ?? {};
    const srcNode       = (nodeId     ? store.nodes[nodeId]         ?? {} : {});
    const srcConsulate  = (consulate  ? store.consulates[consulate] ?? {} : {});
    const srcBot        = (botId      ? store.bots[botId]           ?? {} : {});

    const config = {
        ...srcDefaults,
        ...srcNode,
        ...srcConsulate,
        ...srcBot,
    };

    // Inject dateReservedForUser from dedicated store, filtered by consulate
    config.dateReservedForUser = filterReservedDates(store.reservedDates, consulate);

    return {
        config,
        sources: {
            defaults:      structuredClone(srcDefaults),
            node:          structuredClone(srcNode),
            consulate:     structuredClone(srcConsulate),
            bot:           structuredClone(srcBot),
            reservedDates: structuredClone(store.reservedDates),
        },
    };
}

// ---------------------------------------------------------------------------
// PATCH helpers (shallow merge into the relevant section)
// ---------------------------------------------------------------------------

export async function patchDefaults(patch) {
    store.defaults = { ...store.defaults, ...patch };
    await saveConfig();
    return structuredClone(store.defaults);
}

export async function patchNode(nodeId, patch) {
    store.nodes[nodeId] = { ...(store.nodes[nodeId] ?? {}), ...patch };
    await saveConfig();
    return structuredClone(store.nodes[nodeId]);
}

export async function patchConsulate(id, patch) {
    store.consulates[id] = { ...(store.consulates[id] ?? {}), ...patch };
    await saveConfig();
    return structuredClone(store.consulates[id]);
}

export async function patchBot(botId, patch) {
    store.bots[botId] = { ...(store.bots[botId] ?? {}), ...patch };
    await saveConfig();
    return structuredClone(store.bots[botId]);
}

// ---------------------------------------------------------------------------
// REPLACE helpers (full replacement, no merge)
// ---------------------------------------------------------------------------

export async function replaceDefaults(data) {
    store.defaults = structuredClone(data);
    await saveConfig();
    return structuredClone(store.defaults);
}

export async function replaceNode(nodeId, data) {
    store.nodes[nodeId] = structuredClone(data);
    await saveConfig();
    return structuredClone(store.nodes[nodeId]);
}

export async function replaceConsulate(id, data) {
    store.consulates[id] = structuredClone(data);
    await saveConfig();
    return structuredClone(store.consulates[id]);
}

export async function replaceBot(botId, data) {
    store.bots[botId] = structuredClone(data);
    await saveConfig();
    return structuredClone(store.bots[botId]);
}

// ---------------------------------------------------------------------------
// DELETE helpers
// ---------------------------------------------------------------------------

export async function deleteNode(nodeId) {
    const existed = nodeId in store.nodes;
    delete store.nodes[nodeId];
    if (existed) await saveConfig();
    return existed;
}

export async function deleteConsulate(id) {
    const existed = id in store.consulates;
    delete store.consulates[id];
    if (existed) await saveConfig();
    return existed;
}

export async function deleteBot(botId) {
    const existed = botId in store.bots;
    delete store.bots[botId];
    if (existed) await saveConfig();
    return existed;
}

// ---------------------------------------------------------------------------
// Reserved dates (dedicated store)
// ---------------------------------------------------------------------------

export function getReservedDates() {
    return structuredClone(store.reservedDates);
}

export async function setReservedDates(arr) {
    store.reservedDates = arr;
    await saveConfig();
    return structuredClone(store.reservedDates);
}
