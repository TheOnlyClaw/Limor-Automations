import crypto from 'node:crypto';
function stableStringify(value) {
    return JSON.stringify(value, Object.keys(value).sort());
}
function sha256Hex(input) {
    return crypto.createHash('sha256').update(input).digest('hex');
}
function timingSafeEqualHex(a, b) {
    try {
        const ba = Buffer.from(a, 'hex');
        const bb = Buffer.from(b, 'hex');
        if (ba.length !== bb.length)
            return false;
        return crypto.timingSafeEqual(ba, bb);
    }
    catch {
        return false;
    }
}
function verifyMetaSignature({ secret, rawBody, signatureHeader, }) {
    // Meta sends: X-Hub-Signature-256: sha256=<hex>
    const header = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    if (!header)
        return false;
    const prefix = 'sha256=';
    const trimmed = header.trim();
    if (!trimmed.startsWith(prefix))
        return false;
    const theirHex = trimmed.slice(prefix.length).trim();
    if (!theirHex)
        return false;
    const ourHex = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
    return timingSafeEqualHex(ourHex, theirHex);
}
function computeDedupeKey(payload) {
    try {
        const object = payload?.object ?? 'unknown';
        const entry = Array.isArray(payload?.entry) ? payload.entry : [];
        // Try to build a deterministic key from entry+changes.
        // Facebook webhook shape: { object, entry: [{ id, time, changes: [{ field, value: {...}}]}] }
        const parts = [String(object)];
        for (const e of entry) {
            parts.push(String(e?.id ?? ''));
            const changes = Array.isArray(e?.changes) ? e.changes : [];
            for (const c of changes) {
                parts.push(String(c?.field ?? ''));
                // best-effort: comment id is often in value.id
                const val = c?.value;
                if (val && typeof val === 'object') {
                    if ('id' in val)
                        parts.push(String(val.id));
                    if ('comment_id' in val)
                        parts.push(String(val.comment_id));
                    if ('media_id' in val)
                        parts.push(String(val.media_id));
                }
            }
        }
        const compact = parts.filter(Boolean).join('|');
        if (compact.length > 0 && compact !== 'unknown')
            return sha256Hex(compact);
    }
    catch {
        // ignore
    }
    // Fallback to hash of stable-ish JSON.
    return sha256Hex(stableStringify(payload));
}
export const instagramWebhooksRoutes = async (app) => {
    app.get('/api/v1/webhooks/instagram', async (req, reply) => {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];
        const expected = process.env.IG_WEBHOOK_VERIFY_TOKEN;
        if (!expected) {
            req.log.error('IG_WEBHOOK_VERIFY_TOKEN is not set');
            return reply.code(500).send({ error: 'Server not configured' });
        }
        if (mode === 'subscribe' && token === expected) {
            reply.header('content-type', 'text/plain');
            return reply.code(200).send(String(challenge ?? ''));
        }
        return reply.code(403).send({ error: 'Forbidden' });
    });
    app.post('/api/v1/webhooks/instagram', async (req, reply) => {
        const metaSecret = process.env.META_APP_SECRET;
        if (!metaSecret) {
            req.log.error('META_APP_SECRET is not set');
            return reply.code(500).send({ error: 'Server not configured' });
        }
        const rawBody = req.rawBody;
        if (typeof rawBody !== 'string') {
            req.log.error('rawBody not available; enable Fastify rawBody');
            return reply.code(500).send({ error: 'Server not configured' });
        }
        const sigHeader = req.headers['x-hub-signature-256'] ?? undefined;
        const okSig = verifyMetaSignature({ secret: metaSecret, rawBody, signatureHeader: sigHeader });
        if (!okSig) {
            const debug = process.env.WEBHOOK_DEBUG_SIGNATURE === '1';
            if (debug) {
                const header = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
                const their = (header ?? '').trim().startsWith('sha256=')
                    ? (header ?? '').trim().slice('sha256='.length).trim()
                    : null;
                const our = crypto.createHmac('sha256', metaSecret).update(rawBody, 'utf8').digest('hex');
                req.log.warn({
                    msg: 'invalid-meta-signature',
                    bodyLen: rawBody.length,
                    contentType: req.headers['content-type'],
                    theirPrefix: their ? their.slice(0, 16) : null,
                    ourPrefix: our.slice(0, 16),
                }, 'meta webhook signature mismatch');
            }
            return reply.code(401).send({ error: 'Invalid signature' });
        }
        const payload = req.body;
        const now = new Date().toISOString();
        const payloadJson = JSON.stringify(payload ?? null);
        const dedupeKey = computeDedupeKey(payload);
        const id = crypto.randomUUID();
        try {
            app.db
                .prepare(`INSERT INTO instagram_webhook_events (id, dedupe_key, received_at, payload_json, status, attempts)
           VALUES (@id, @dedupe_key, @received_at, @payload_json, 'pending', 0)`)
                .run({
                id,
                dedupe_key: dedupeKey,
                received_at: now,
                payload_json: payloadJson,
            });
        }
        catch (err) {
            if (String(err?.message ?? '').includes('UNIQUE') || String(err?.code ?? '') === 'SQLITE_CONSTRAINT_UNIQUE') {
                req.log.info({ dedupeKey }, 'duplicate webhook delivery ignored');
            }
            else {
                req.log.error({ err }, 'failed to persist webhook event');
            }
        }
        return reply.code(200).send({ ok: true });
    });
};
