import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addAutoSnapshot } from './historyStore.js';

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
 * Strips the internal `_meta` key from a config object before merging,
 * so admin metadata never leaks into the resolved bot config.
 */
function stripMeta(obj) {
    const { _meta, ...rest } = obj;
    return rest;
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
 * If the consulate, node, or bot has `_meta.disabled === true`, the resolved
 * config will contain `disabled: true` so bots know to stop working.
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
        ...stripMeta(srcDefaults),
        ...stripMeta(srcNode),
        ...stripMeta(srcConsulate),
        ...stripMeta(srcBot),
    };

    // Propagate disabled flag if any active level is marked disabled
    if (srcConsulate._meta?.disabled || srcNode._meta?.disabled || srcBot._meta?.disabled) {
        config.disabled = true;
    }

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
    await addAutoSnapshot(getRawConfig());
    store.defaults = { ...store.defaults, ...patch };
    await saveConfig();
    return structuredClone(store.defaults);
}

export async function patchNode(nodeId, patch) {
    await addAutoSnapshot(getRawConfig());
    store.nodes[nodeId] = { ...(store.nodes[nodeId] ?? {}), ...patch };
    await saveConfig();
    return structuredClone(store.nodes[nodeId]);
}

export async function patchConsulate(id, patch) {
    await addAutoSnapshot(getRawConfig());
    store.consulates[id] = { ...(store.consulates[id] ?? {}), ...patch };
    await saveConfig();
    return structuredClone(store.consulates[id]);
}

export async function patchBot(botId, patch) {
    await addAutoSnapshot(getRawConfig());
    store.bots[botId] = { ...(store.bots[botId] ?? {}), ...patch };
    await saveConfig();
    return structuredClone(store.bots[botId]);
}

// ---------------------------------------------------------------------------
// REPLACE helpers (full replacement, no merge)
// ---------------------------------------------------------------------------

export async function replaceDefaults(data) {
    await addAutoSnapshot(getRawConfig());
    store.defaults = structuredClone(data);
    await saveConfig();
    return structuredClone(store.defaults);
}

export async function replaceNode(nodeId, data) {
    await addAutoSnapshot(getRawConfig());
    store.nodes[nodeId] = structuredClone(data);
    await saveConfig();
    return structuredClone(store.nodes[nodeId]);
}

export async function replaceConsulate(id, data) {
    await addAutoSnapshot(getRawConfig());
    store.consulates[id] = structuredClone(data);
    await saveConfig();
    return structuredClone(store.consulates[id]);
}

export async function replaceBot(botId, data) {
    await addAutoSnapshot(getRawConfig());
    store.bots[botId] = structuredClone(data);
    await saveConfig();
    return structuredClone(store.bots[botId]);
}

// ---------------------------------------------------------------------------
// DELETE helpers
// ---------------------------------------------------------------------------

export async function deleteNode(nodeId) {
    const existed = nodeId in store.nodes;
    if (existed) {
        await addAutoSnapshot(getRawConfig());
        delete store.nodes[nodeId];
        await saveConfig();
    }
    return existed;
}

export async function deleteConsulate(id) {
    const existed = id in store.consulates;
    if (existed) {
        await addAutoSnapshot(getRawConfig());
        delete store.consulates[id];
        await saveConfig();
    }
    return existed;
}

export async function deleteBot(botId) {
    const existed = botId in store.bots;
    if (existed) {
        await addAutoSnapshot(getRawConfig());
        delete store.bots[botId];
        await saveConfig();
    }
    return existed;
}

// ---------------------------------------------------------------------------
// Reserved dates (dedicated store)
// ---------------------------------------------------------------------------

export function getReservedDates() {
    return structuredClone(store.reservedDates);
}

export async function setReservedDates(arr) {
    await addAutoSnapshot(getRawConfig());
    store.reservedDates = arr;
    await saveConfig();
    return structuredClone(store.reservedDates);
}

// ---------------------------------------------------------------------------
// Restore (full config replace)
// ---------------------------------------------------------------------------

export async function restoreConfig(snapshot) {
    store.defaults     = snapshot.defaults     ?? {};
    store.nodes        = snapshot.nodes        ?? {};
    store.consulates   = snapshot.consulates   ?? {};
    store.bots         = snapshot.bots         ?? {};
    store.reservedDates = snapshot.reservedDates ?? [];
    await saveConfig();
    return getRawConfig();
}

// ---------------------------------------------------------------------------
// Distributor notification
// ---------------------------------------------------------------------------

const DISTRIBUTOR_URL = process.env.DISTRIBUTOR_URL ?? null;

/**
 * Fire-and-forget POST to distributor /api/v1/notify/config-updated.
 * Fails silently — bots will pick up the change on next poll.
 *
 * @param {object} payload - e.g. { level: 'consulate', consulate: 'cy_au' }
 */
export async function notifyDistributor(payload = {}) {
    if (!DISTRIBUTOR_URL) return;
    try {
        await fetch(`${DISTRIBUTOR_URL}/api/v1/notify/config-updated`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    } catch (err) {
        console.warn('[configStore] notifyDistributor failed (bots will poll):', err.message);
    }
}
