import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadConfig } from './src/store/configStore.js';
import { loadHistory } from './src/store/historyStore.js';
import { registerRoutes } from './src/api/routes.js';

const PORT = Number(process.env.PORT ?? 3200);
const HOST = process.env.HOST ?? '0.0.0.0';

const fastify = Fastify({ logger: true });

await fastify.register(cors, {
    origin: true,
});

// Allow DELETE requests with Content-Type: application/json but empty body
fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body) return done(null, {});
    try {
        done(null, JSON.parse(body));
    } catch (err) {
        done(err);
    }
});

await registerRoutes(fastify);

try {
    await loadConfig();
    await loadHistory();
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`vsr-config listening on ${HOST}:${PORT}`);
} catch (err) {
    fastify.log.error(err);
    process.exit(1);
}
