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

type QuickReply = { title: string; payload: string }

function toQuickReplies(items: QuickReply[]) {
  return items.map((item) => ({
    content_type: 'text',
    title: item.title.slice(0, 20),
    payload: item.payload.slice(0, 1000),
  }))
}

export async function sendDm(args: {
  accessToken: string
  senderIgUserId: string
  commentId: string
  message: string
  quickReplies?: QuickReply[]
}) {
  const url = new URL(`https://graph.instagram.com/${graphVersion()}/${args.senderIgUserId}/messages`)
  url.searchParams.set('access_token', args.accessToken)

  return graphPostJson(url.toString(), {
    recipient: { comment_id: args.commentId },
    message: {
      text: args.message,
      ...(args.quickReplies && args.quickReplies.length
        ? { quick_replies: toQuickReplies(args.quickReplies) }
        : {}),
    },
  })
}

export async function sendRecipientDm(args: {
  accessToken: string
  senderIgUserId: string
  recipientId: string
  message: string
}) {
  const url = new URL(`https://graph.instagram.com/${graphVersion()}/${args.senderIgUserId}/messages`)
  url.searchParams.set('access_token', args.accessToken)

  return graphPostJson(url.toString(), {
    recipient: { id: args.recipientId },
    message: { text: args.message },
  })
}
