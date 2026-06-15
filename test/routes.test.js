import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from './helpers/app.js';

// Unique prefix so test keys don't collide with real data
const T = `_test_${Date.now()}`;

let app;

before(async () => {
    app = await buildApp();
});

after(async () => {
    // Clean up all test entries created during the run
    await app.inject({ method: 'DELETE', url: `/api/v1/config/nodes/${T}-node` });
    await app.inject({ method: 'DELETE', url: `/api/v1/config/consulates/${T}-consulate` });
    await app.inject({ method: 'DELETE', url: `/api/v1/config/bots/${T}-bot` });
    await app.close();
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

describe('GET /health', () => {
    it('returns { status: ok }', async () => {
        const res = await app.inject({ method: 'GET', url: '/health' });
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.json(), { status: 'ok' });
    });
});

// ---------------------------------------------------------------------------
// Raw config
// ---------------------------------------------------------------------------

describe('GET /api/v1/config/raw', () => {
    it('returns an object with expected top-level keys', async () => {
        const res = await app.inject({ method: 'GET', url: '/api/v1/config/raw' });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.ok('defaults' in body);
        assert.ok('nodes' in body);
        assert.ok('consulates' in body);
        assert.ok('bots' in body);
    });
});

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

describe('PATCH /api/v1/config/defaults', () => {
    it('merges new keys into defaults', async () => {
        const res = await app.inject({
            method: 'PATCH',
            url: '/api/v1/config/defaults',
            payload: { [`${T}_key`]: 42 },
        });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().defaults[`${T}_key`], 42);
    });

    it('returns 400 for non-object body', async () => {
        const res = await app.inject({
            method: 'PATCH',
            url: '/api/v1/config/defaults',
            payload: [1, 2, 3],
        });
        assert.equal(res.statusCode, 400);
    });
});

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

describe('PATCH /api/v1/config/nodes/:nodeId', () => {
    it('creates a node config', async () => {
        const res = await app.inject({
            method: 'PATCH',
            url: `/api/v1/config/nodes/${T}-node`,
            payload: { proxy: 'test-proxy' },
        });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().config.proxy, 'test-proxy');
    });

    it('merges subsequent patches', async () => {
        await app.inject({
            method: 'PATCH',
            url: `/api/v1/config/nodes/${T}-node`,
            payload: { maxThreads: 5 },
        });
        const raw = await app.inject({ method: 'GET', url: '/api/v1/config/raw' });
        const node = raw.json().nodes[`${T}-node`];
        assert.equal(node.proxy, 'test-proxy');
        assert.equal(node.maxThreads, 5);
    });
});

describe('DELETE /api/v1/config/nodes/:nodeId', () => {
    it('deletes an existing node', async () => {
        await app.inject({
            method: 'PATCH',
            url: `/api/v1/config/nodes/${T}-node-del`,
            payload: { x: 1 },
        });
        const res = await app.inject({
            method: 'DELETE',
            url: `/api/v1/config/nodes/${T}-node-del`,
        });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().deleted, true);
    });

    it('returns 404 for unknown node', async () => {
        const res = await app.inject({
            method: 'DELETE',
            url: `/api/v1/config/nodes/${T}-no-such-node`,
        });
        assert.equal(res.statusCode, 404);
    });
});

// ---------------------------------------------------------------------------
// Consulates
// ---------------------------------------------------------------------------

describe('PATCH /api/v1/config/consulates/:id', () => {
    it('creates a consulate config', async () => {
        const res = await app.inject({
            method: 'PATCH',
            url: `/api/v1/config/consulates/${T}-consulate`,
            payload: { appointmentDate: '2099-01-01' },
        });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().config.appointmentDate, '2099-01-01');
    });
});

describe('DELETE /api/v1/config/consulates/:id', () => {
    it('returns 404 for unknown consulate', async () => {
        const res = await app.inject({
            method: 'DELETE',
            url: `/api/v1/config/consulates/${T}-no-such`,
        });
        assert.equal(res.statusCode, 404);
    });
});

// ---------------------------------------------------------------------------
// Bots
// ---------------------------------------------------------------------------

describe('PATCH /api/v1/config/bots/:botId', () => {
    it('creates a bot config', async () => {
        const res = await app.inject({
            method: 'PATCH',
            url: `/api/v1/config/bots/${T}-bot`,
            payload: { appointmentDate: '2099-06-15' },
        });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().config.appointmentDate, '2099-06-15');
    });
});

describe('DELETE /api/v1/config/bots/:botId', () => {
    it('returns 404 for unknown bot', async () => {
        const res = await app.inject({
            method: 'DELETE',
            url: `/api/v1/config/bots/${T}-no-such`,
        });
        assert.equal(res.statusCode, 404);
    });
});

// ---------------------------------------------------------------------------
// Bot config resolution
// ---------------------------------------------------------------------------

describe('GET /api/v1/bot-config/:botId', () => {
    before(async () => {
        // Set up a mini hierarchy for resolution tests
        await app.inject({
            method: 'PATCH',
            url: `/api/v1/config/nodes/${T}-node`,
            payload: { proxy: 'node-proxy' },
        });
        await app.inject({
            method: 'PATCH',
            url: `/api/v1/config/consulates/${T}-consulate`,
            payload: { appointmentDate: '2099-03-01' },
        });
        await app.inject({
            method: 'PATCH',
            url: `/api/v1/config/bots/${T}-bot`,
            payload: { appointmentDate: '2099-06-15' },
        });
    });

    it('returns config and sources', async () => {
        const res = await app.inject({
            method: 'GET',
            url: `/api/v1/bot-config/${T}-bot`,
            query: { nodeId: `${T}-node`, consulate: `${T}-consulate` },
        });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.ok('config' in body);
        assert.ok('sources' in body);
    });

    it('bot level overrides consulate', async () => {
        const res = await app.inject({
            method: 'GET',
            url: `/api/v1/bot-config/${T}-bot`,
            query: { nodeId: `${T}-node`, consulate: `${T}-consulate` },
        });
        // bot has appointmentDate 2099-06-15, consulate has 2099-03-01 → bot wins
        assert.equal(res.json().config.appointmentDate, '2099-06-15');
    });

    it('node-level key is included in merged config', async () => {
        const res = await app.inject({
            method: 'GET',
            url: `/api/v1/bot-config/${T}-bot`,
            query: { nodeId: `${T}-node`, consulate: `${T}-consulate` },
        });
        assert.equal(res.json().config.proxy, 'node-proxy');
    });

    it('works without nodeId and consulate', async () => {
        const res = await app.inject({
            method: 'GET',
            url: `/api/v1/bot-config/${T}-bot`,
        });
        assert.equal(res.statusCode, 200);
        // No node or consulate → only defaults + bot
        assert.equal(res.json().config.appointmentDate, '2099-06-15');
    });

    it('sources reflect correct layering', async () => {
        const res = await app.inject({
            method: 'GET',
            url: `/api/v1/bot-config/${T}-bot`,
            query: { nodeId: `${T}-node`, consulate: `${T}-consulate` },
        });
        const { sources } = res.json();
        assert.equal(sources.node.proxy, 'node-proxy');
        assert.equal(sources.consulate.appointmentDate, '2099-03-01');
        assert.equal(sources.bot.appointmentDate, '2099-06-15');
    });
});

// ---------------------------------------------------------------------------
// Optimistic concurrency (revision guard)
// ---------------------------------------------------------------------------

describe('Revision guard (If-Match)', () => {
    const key = `${T}-rev-bot`;

    after(async () => {
        await app.inject({ method: 'DELETE', url: `/api/v1/config/bots/${key}` });
    });

    it('exposes per-resource revisions in /config/raw', async () => {
        await app.inject({
            method: 'PUT',
            url: `/api/v1/config/bots/${key}`,
            payload: { a: 1 },
        });
        const raw = await app.inject({ method: 'GET', url: '/api/v1/config/raw' });
        assert.ok('revisions' in raw.json());
        assert.ok(raw.json().revisions[`bots/${key}`] >= 1);
    });

    it('allows a write whose If-Match matches the current revision', async () => {
        const raw = await app.inject({ method: 'GET', url: '/api/v1/config/raw' });
        const rev = raw.json().revisions[`bots/${key}`];
        const res = await app.inject({
            method: 'PUT',
            url: `/api/v1/config/bots/${key}`,
            headers: { 'if-match': String(rev) },
            payload: { a: 2 },
        });
        assert.equal(res.statusCode, 200);
    });

    it('rejects a stale write with 409 REVISION_MISMATCH', async () => {
        const raw = await app.inject({ method: 'GET', url: '/api/v1/config/raw' });
        const rev = raw.json().revisions[`bots/${key}`];
        // Someone else writes first → revision advances
        await app.inject({
            method: 'PUT',
            url: `/api/v1/config/bots/${key}`,
            headers: { 'if-match': String(rev) },
            payload: { a: 3 },
        });
        // Our write still carries the old revision → conflict
        const res = await app.inject({
            method: 'PUT',
            url: `/api/v1/config/bots/${key}`,
            headers: { 'if-match': String(rev) },
            payload: { a: 4 },
        });
        assert.equal(res.statusCode, 409);
        assert.equal(res.json().code, 'REVISION_MISMATCH');
        // Value must be unchanged from the conflicting write, not ours
        const raw2 = await app.inject({ method: 'GET', url: '/api/v1/config/raw' });
        assert.equal(raw2.json().bots[key].a, 3);
    });

    it('skips the guard when no If-Match header is sent (back-compat / create)', async () => {
        const res = await app.inject({
            method: 'PUT',
            url: `/api/v1/config/bots/${key}`,
            payload: { a: 5 },
        });
        assert.equal(res.statusCode, 200);
    });
});

// ---------------------------------------------------------------------------
// Attribution + lightweight revisions endpoint
// ---------------------------------------------------------------------------

describe('Attribution (X-User) and /config/revisions', () => {
    const key = `${T}-attr-bot`;

    after(async () => {
        await app.inject({ method: 'DELETE', url: `/api/v1/config/bots/${key}` });
    });

    it('records the acting user from the X-User header', async () => {
        await app.inject({
            method: 'PUT',
            url: `/api/v1/config/bots/${key}`,
            headers: { 'x-user': 'Anna' },
            payload: { a: 1 },
        });
        const meta = await app.inject({ method: 'GET', url: '/api/v1/config/revisions' });
        assert.equal(meta.statusCode, 200);
        const body = meta.json();
        assert.ok('revisions' in body && 'modifiedBy' in body);
        assert.equal(body.modifiedBy[`bots/${key}`].user, 'Anna');
        assert.ok(body.modifiedBy[`bots/${key}`].at);
    });

    it('falls back to "unknown" when no X-User header is sent', async () => {
        await app.inject({
            method: 'PUT',
            url: `/api/v1/config/bots/${key}`,
            payload: { a: 2 },
        });
        const meta = await app.inject({ method: 'GET', url: '/api/v1/config/revisions' });
        assert.equal(meta.json().modifiedBy[`bots/${key}`].user, 'unknown');
    });
});
