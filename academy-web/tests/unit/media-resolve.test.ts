import { describe, expect, it } from 'vitest'
import type { CourseNode } from '@/lib/content/course-types'
import type { PublicLesson } from '@/lib/content/public-lesson'
import { verifyMediaGrant } from '@/lib/media/grant'
import { resolveAuthorizedLessonMedia } from '@/lib/media/resolve'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SECRET = 'test-only-media-signing-secret-32-bytes-minimum'

function lesson(nodeId: string, href = '/media/sample-handout.pdf'): PublicLesson {
  return {
    nodeId,
    locale: 'en',
    title: 'Lesson',
    objective: 'Objective',
    blocks: [{ kind: 'attachment', title: 'Handout', href, fileType: 'pdf' }],
    cheatsheet: [],
    checkpoint: [],
  }
}

function node(id: string, src?: string): CourseNode {
  return {
    id,
    kind: 'lesson',
    prerequisites: [],
    estimatedMinutes: 5,
    skillWeights: { skill: 1 },
    video: src ? { src, durationSeconds: 60, cues: [] } : undefined,
  }
}

describe('authorized lesson media resolver', () => {
  it('keeps private media extensions out of public ASSETS', () => {
    const root = join(process.cwd(), 'public')
    const files: string[] = []
    const walk = (directory: string) => {
      for (const name of readdirSync(directory)) {
        const path = join(directory, name)
        if (statSync(path).isDirectory()) walk(path)
        else files.push(path)
      }
    }
    walk(root)
    expect(files.filter((file) => /\.(?:mp4|vtt|pdf|zip)$/i.test(file))).toEqual([])
  })

  it('signs only the registered asset bound to the authorized course and node', async () => {
    const result = await resolveAuthorizedLessonMedia(node('formats-references'), lesson('formats-references'), {
      courseSlug: 'content-formats-demo',
      nodeId: 'formats-references',
      secret: SECRET,
      nowSeconds: 1_000,
      ttlSeconds: 300,
    })
    const href = result.lesson.blocks[0].kind === 'attachment' ? result.lesson.blocks[0].href : ''
    expect(href).toMatch(/^\/api\/media\/open\?token=/)
    const token = decodeURIComponent(href.slice('/api/media/open?token='.length))
    await expect(verifyMediaGrant(token, SECRET, 1_299)).resolves.toMatchObject({
      assetId: 'formats-handout',
      courseSlug: 'content-formats-demo',
      nodeId: 'formats-references',
    })
  })

  it('leaves public instructional images unchanged', async () => {
    const publicLesson = lesson('formats-references', '/media/sample-diagram.svg')
    const result = await resolveAuthorizedLessonMedia(node('formats-references'), publicLesson, {
      courseSlug: 'content-formats-demo',
      nodeId: 'formats-references',
      secret: SECRET,
    })
    expect(result.lesson.blocks[0]).toMatchObject({ href: '/media/sample-diagram.svg' })
  })

  it('fails closed for unregistered private media and ownership mismatch', async () => {
    await expect(
      resolveAuthorizedLessonMedia(node('formats-references'), lesson('formats-references', '/media/new.pdf'), {
        courseSlug: 'content-formats-demo',
        nodeId: 'formats-references',
        secret: SECRET,
      }),
    ).rejects.toThrow(/not registered/)
    await expect(
      resolveAuthorizedLessonMedia(node('wrong-node'), lesson('wrong-node'), {
        courseSlug: 'content-formats-demo',
        nodeId: 'wrong-node',
        secret: SECRET,
      }),
    ).rejects.toThrow(/ownership mismatch/)
  })

  it('signs video audio and caption tracks without exposing object keys', async () => {
    const videoNode = node('os-what-it-does', '/media/lesson-demo.mp4')
    videoNode.video!.captions = [
      { locale: 'en', label: 'English', src: '/media/captions/os-what-it-does.en.vtt' },
    ]
    const result = await resolveAuthorizedLessonMedia(videoNode, lesson('os-what-it-does', '/media/sample-diagram.svg'), {
      courseSlug: 'basic-os-linux',
      nodeId: 'os-what-it-does',
      secret: SECRET,
    })
    expect(result.node.video?.src).toMatch(/^\/api\/media\/open\?token=/)
    expect(result.node.video?.captions?.[0].src).toMatch(/^\/api\/media\/open\?token=/)
    expect(JSON.stringify(result)).not.toContain('basic-os-linux/os-what-it-does/lesson-demo.mp4')
  })
})
