import fp from 'fastify-plugin';
// Captures the raw request body as a UTF-8 string for signature verification.
export const rawBodyPlugin = async (app) => {
    app.removeContentTypeParser('application/json');
    app.addContentTypeParser(['application/json', 'application/*+json'], { parseAs: 'buffer' }, async (req, body) => {
        const raw = body.toString('utf8');
        req.rawBody = raw;
        if (!raw.trim())
            return null;
        return JSON.parse(raw);
    });
    app.addContentTypeParser('*', { parseAs: 'buffer' }, async (req, body) => {
        ;
        req.rawBody = body.toString('utf8');
        return body;
    });
};
export default fp(rawBodyPlugin, { name: 'rawBody' });
