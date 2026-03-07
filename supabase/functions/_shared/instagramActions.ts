import { graphPostForm, graphPostJson } from './instagramGraph.ts'

declare const Deno: any

function graphVersion() {
  return Deno.env.get('FB_GRAPH_VERSION') ?? 'v19.0'
}

export async function sendCommentReply(args: { accessToken: string; commentId: string; message: string }) {
  const url = `https://graph.instagram.com/${graphVersion()}/${args.commentId}/replies`
  return graphPostForm(url, {
    message: args.message,
    access_token: args.accessToken,
  })
}

export async function sendDm(args: { accessToken: string; senderIgUserId: string; commentId: string; message: string }) {
  const url = new URL(`https://graph.instagram.com/${graphVersion()}/${args.senderIgUserId}/messages`)
  url.searchParams.set('access_token', args.accessToken)

  return graphPostJson(url.toString(), {
    recipient: { comment_id: args.commentId },
    message: { text: args.message },
  })
}
