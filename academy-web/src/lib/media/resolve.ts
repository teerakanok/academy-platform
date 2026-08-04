import type { CourseNode } from '@/lib/content/course-types'
import type { PublicLesson, PublicLessonBlock } from '@/lib/content/public-lesson'
import { issueMediaGrant } from './grant'
import { privateMediaByLegacyPath } from './registry'

const PRIVATE_EXTENSION = /\.(?:mp4|vtt|pdf|zip)$/i
export const DELIVERY_GRANT_TTL_SECONDS = 5 * 60

interface MediaContext {
  courseSlug: string
  nodeId: string
  secret: string
  nowSeconds?: number
  ttlSeconds?: number
}

async function resolveReference(reference: string, context: MediaContext): Promise<string> {
  const asset = privateMediaByLegacyPath(reference)
  if (!asset) {
    if (reference.startsWith('/media/') && PRIVATE_EXTENSION.test(reference)) {
      throw new Error(`private media is not registered: ${reference}`)
    }
    return reference
  }
  if (asset.courseSlug !== context.courseSlug || asset.nodeId !== context.nodeId) {
    throw new Error(`private media ownership mismatch: ${reference}`)
  }
  const now = context.nowSeconds ?? Math.floor(Date.now() / 1000)
  const ttl = context.ttlSeconds ?? DELIVERY_GRANT_TTL_SECONDS
  if (!Number.isSafeInteger(ttl) || ttl < 60 || ttl > 60 * 60) throw new Error('invalid media grant TTL')
  const token = await issueMediaGrant(
    {
      assetId: asset.id,
      courseSlug: context.courseSlug,
      nodeId: context.nodeId,
      expiresAt: now + ttl,
    },
    context.secret,
  )
  return `/api/media/open?token=${encodeURIComponent(token)}`
}

export async function resolveAuthorizedLessonMedia(
  node: CourseNode,
  lesson: PublicLesson,
  context: MediaContext,
): Promise<{ node: CourseNode; lesson: PublicLesson }> {
  if (node.id !== context.nodeId || lesson.nodeId !== context.nodeId) {
    throw new Error('media context does not match lesson')
  }

  const video = node.video
    ? {
        ...node.video,
        src: node.video.src ? await resolveReference(node.video.src, context) : undefined,
        audio: node.video.audio
          ? await Promise.all(
              node.video.audio.map(async (track) => ({ ...track, src: await resolveReference(track.src, context) })),
            )
          : undefined,
        captions: node.video.captions
          ? await Promise.all(
              node.video.captions.map(async (track) => ({ ...track, src: await resolveReference(track.src, context) })),
            )
          : undefined,
      }
    : undefined

  const blocks = await Promise.all(
    lesson.blocks.map(async (block): Promise<PublicLessonBlock> => {
      if (block.kind === 'attachment') {
        return { ...block, href: await resolveReference(block.href, context) }
      }
      return block
    }),
  )

  return { node: { ...node, video }, lesson: { ...lesson, blocks } }
}
