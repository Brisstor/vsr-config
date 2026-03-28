import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadConfig } from '../../src/store/configStore.js';
import { registerRoutes } from '../../src/api/routes.js';

export async function buildApp() {
    const app = Fastify({ logger: false });
    await app.register(cors, { origin: true });
    await registerRoutes(app);
    await loadConfig();
    await app.ready();
    return app;
}
