export type ParsedCommentEvent = {
  igPostId: string
  commentId: string
  fromId: string | null
  selfIgScopedId: string | null
  commentText: string
}

export function extractCommentEvent(payload: unknown): ParsedCommentEvent | null {
  if (!payload || typeof payload !== 'object') return null

  const entry = (payload as { entry?: Array<{ changes?: Array<{ value?: Record<string, unknown> }> }> }).entry?.[0]
  const change = entry?.changes?.[0]
  const value = change?.value
  const media = value?.media
  const from = value?.from

  const getString = (input: unknown) => (typeof input === 'string' && input.trim() ? input : null)

  const igPostId = getString(value?.media_id) ?? getString((media as Record<string, unknown> | undefined)?.id)
  const commentId = getString(value?.id) ?? getString(value?.comment_id)
  const fromId = getString((from as Record<string, unknown> | undefined)?.id)
  const selfIgScopedId =
    getString(value?.self_ig_scoped_id) ?? getString((from as Record<string, unknown> | undefined)?.self_ig_scoped_id)
  const commentText = getString(value?.text) ?? getString(value?.message)

  if (!igPostId || !commentId || !commentText) return null

  return {
    igPostId,
    commentId,
    fromId,
    selfIgScopedId,
    commentText,
  }
}
