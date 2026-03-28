import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadConfig } from '../../src/store/configStore.js';
import { registerRoutes } from '../../src/api/routes.js';

export async function buildApp() {
    const app = Fastify({ logger: false });
    await app.register(cors, { origin: true });

    app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
        if (!body) return done(null, {});
        try {
            done(null, JSON.parse(body));
        } catch (err) {
            done(err);
        }
    });

    await registerRoutes(app);
    await loadConfig();
    await app.ready();
    return app;
}
