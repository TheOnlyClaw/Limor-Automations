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


// Best-effort DM with an image attachment.
// Caveat: Meta may reject attachments when using recipient.comment_id (private reply to comment).
// Callers should catch errors and fallback to text-only.
export async function sendDmWithImage(args: {
  accessToken: string
  senderIgUserId: string
  commentId: string
  imageUrl: string
  caption?: string | null
}) {
  const url = new URL(`https://graph.instagram.com/${graphVersion()}/${args.senderIgUserId}/messages`)
  url.searchParams.set('access_token', args.accessToken)

  // Attempt a single message with attachment + optional caption.
  // If the API doesn't allow text with attachment, caller can fallback to two messages.
  return graphPostJson(url.toString(), {
    recipient: { comment_id: args.commentId },
    message: {
      attachment: {
        type: 'image',
        payload: {
          url: args.imageUrl,
          is_reusable: true,
        },
      },
      ...(args.caption ? { text: args.caption } : {}),
    },
  })
}

export async function sendRecipientDmWithImage(args: {
  accessToken: string
  senderIgUserId: string
  recipientId: string
  imageUrl: string
}) {
  const url = new URL(`https://graph.instagram.com/${graphVersion()}/${args.senderIgUserId}/messages`)
  url.searchParams.set('access_token', args.accessToken)

  return graphPostJson(url.toString(), {
    recipient: { id: args.recipientId },
    message: {
      attachment: {
        type: 'image',
        payload: {
          url: args.imageUrl,
          is_reusable: true,
        },
      },
    },
  })
}
