import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadConfig } from './src/store/configStore.js';
import { registerRoutes } from './src/api/routes.js';

const PORT = Number(process.env.PORT ?? 3200);
const HOST = process.env.HOST ?? '0.0.0.0';

const fastify = Fastify({ logger: true });

await fastify.register(cors, {
    origin: true,
});

await registerRoutes(fastify);

try {
    await loadConfig();
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`vsr-config listening on ${HOST}:${PORT}`);
} catch (err) {
    fastify.log.error(err);
    process.exit(1);
}
