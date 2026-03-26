import {
    getRawConfig,
    resolveConfig,
    patchDefaults,
    patchNode,
    patchConsulate,
    patchBot,
    deleteNode,
    deleteConsulate,
    deleteBot,
} from '../store/configStore.js';

export async function registerRoutes(fastify) {
    // GET /health
    fastify.get('/health', async (_req, reply) => {
        return reply.send({ status: 'ok' });
    });

    // GET /api/v1/bot-config/:botId
    // Query params: nodeId (optional), consulate (optional)
    fastify.get('/api/v1/bot-config/:botId', async (req, reply) => {
        const { botId } = req.params;
        const { nodeId = null, consulate = null } = req.query;
        const result = resolveConfig(botId, nodeId, consulate);
        return reply.send(result);
    });

    // GET /api/v1/config/raw
    fastify.get('/api/v1/config/raw', async (_req, reply) => {
        return reply.send(getRawConfig());
    });

    // PATCH /api/v1/config/defaults
    fastify.patch('/api/v1/config/defaults', async (req, reply) => {
        if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
            return reply.status(400).send({ error: 'Body must be a JSON object.' });
        }
        const updated = await patchDefaults(req.body);
        return reply.send({ defaults: updated });
    });

    // PATCH /api/v1/config/nodes/:nodeId
    fastify.patch('/api/v1/config/nodes/:nodeId', async (req, reply) => {
        if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
            return reply.status(400).send({ error: 'Body must be a JSON object.' });
        }
        const { nodeId } = req.params;
        const updated = await patchNode(nodeId, req.body);
        return reply.send({ nodeId, config: updated });
    });

    // PATCH /api/v1/config/consulates/:id
    fastify.patch('/api/v1/config/consulates/:id', async (req, reply) => {
        if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
            return reply.status(400).send({ error: 'Body must be a JSON object.' });
        }
        const { id } = req.params;
        const updated = await patchConsulate(id, req.body);
        return reply.send({ consulate: id, config: updated });
    });

    // PATCH /api/v1/config/bots/:botId
    fastify.patch('/api/v1/config/bots/:botId', async (req, reply) => {
        if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
            return reply.status(400).send({ error: 'Body must be a JSON object.' });
        }
        const { botId } = req.params;
        const updated = await patchBot(botId, req.body);
        return reply.send({ botId, config: updated });
    });

    // DELETE /api/v1/config/nodes/:nodeId
    fastify.delete('/api/v1/config/nodes/:nodeId', async (req, reply) => {
        const { nodeId } = req.params;
        const existed = await deleteNode(nodeId);
        if (!existed) {
            return reply.status(404).send({ error: `Node '${nodeId}' not found.` });
        }
        return reply.send({ deleted: true, nodeId });
    });

    // DELETE /api/v1/config/consulates/:id
    fastify.delete('/api/v1/config/consulates/:id', async (req, reply) => {
        const { id } = req.params;
        const existed = await deleteConsulate(id);
        if (!existed) {
            return reply.status(404).send({ error: `Consulate '${id}' not found.` });
        }
        return reply.send({ deleted: true, consulate: id });
    });

    // DELETE /api/v1/config/bots/:botId
    fastify.delete('/api/v1/config/bots/:botId', async (req, reply) => {
        const { botId } = req.params;
        const existed = await deleteBot(botId);
        if (!existed) {
            return reply.status(404).send({ error: `Bot '${botId}' not found.` });
        }
        return reply.send({ deleted: true, botId });
    });
}
