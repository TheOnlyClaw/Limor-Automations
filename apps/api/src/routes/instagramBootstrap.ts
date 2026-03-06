import type { FastifyPluginAsync } from 'fastify'

type GraphPage = {
  id: string
  name?: string
  access_token?: string
  instagram_business_account?: { id: string }
}

type GraphAccountsResponse = {
  data?: GraphPage[]
}

async function graphGet<T>({
  version,
  path,
  accessToken,
}: {
  version: string
  path: string
  accessToken: string
}): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${version}/${path}`)
  url.searchParams.set('access_token', accessToken)

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      accept: 'application/json',
    },
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Graph GET failed (${res.status}): ${text}`)
  }
  return JSON.parse(text) as T
}

export const instagramBootstrapRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/v1/instagram-tokens/:id/resolve-ids', async (req, reply) => {
    const id = (req.params as any).id as string
    const version = process.env.FB_GRAPH_VERSION ?? 'v21.0'

    const tokenRow = app.db
      .prepare('SELECT id, access_token FROM instagram_tokens WHERE id = ?')
      .get(id) as { id: string; access_token: string } | undefined

    if (!tokenRow) return reply.code(404).send({ error: 'Not found' })

    // We resolve via /me/accounts to find a Page with instagram_business_account
    // Note: This requires the token to have permissions.
    const accounts = await graphGet<GraphAccountsResponse>({
      version,
      path: `me/accounts?fields=id,name,instagram_business_account`,
      accessToken: tokenRow.access_token,
    })

    const pages = Array.isArray(accounts.data) ? accounts.data : []
    const pageWithIg = pages.find((p) => p.instagram_business_account?.id)

    if (!pageWithIg?.id || !pageWithIg.instagram_business_account?.id) {
      return reply.code(422).send({
        error: 'Unable to resolve page_id / ig_user_id from token',
      })
    }

    const pageId = pageWithIg.id
    const igUserId = pageWithIg.instagram_business_account.id

    app.db
      .prepare(
        `UPDATE instagram_tokens
         SET page_id = ?, ig_user_id = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(pageId, igUserId, id)

    return reply.code(200).send({
      id,
      page_id: pageId,
      ig_user_id: igUserId,
    })
  })
}
