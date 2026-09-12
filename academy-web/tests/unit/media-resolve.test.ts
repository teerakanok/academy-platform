import { describe, expect, it } from 'vitest'
import type { CourseNode } from '@/lib/content/course-types'
import type { PublicLesson } from '@/lib/content/public-lesson'
import { resolveAuthorizedLessonMedia } from '@/lib/media/resolve'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { loadCourseStructure } from '@/lib/content/course-loader'

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
  it.each(['https://unapproved.example/video.mp4', '//unapproved.example/video.mp4', 'data:video/mp4;base64,AAAA', '/media/unregistered.mp3'])
    ('rejects unregistered video tracks at authoring and delivery boundaries: %s', async (reference) => {
      const file = 'content/courses/basic-os-linux/course.json'
      const structure = JSON.parse(readFileSync(file, 'utf8'))
      const videoNode = structure.nodes.find((entry: CourseNode) => entry.video)
      videoNode.video.src = reference
      expect(() => loadCourseStructure(file, structure)).toThrow(/private media registry/)
      await expect(resolveAuthorizedLessonMedia(node('os-what-it-does', reference),
        lesson('os-what-it-does', '/media/sample-diagram.svg'), {
          courseSlug: 'basic-os-linux', nodeId: 'os-what-it-does',
        })).rejects.toThrow(/not registered/)
    })

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

  it('uses only the registered asset ID in the delivery path', async () => {
    const result = await resolveAuthorizedLessonMedia(node('formats-references'), lesson('formats-references'), {
      courseSlug: 'content-formats-demo',
      nodeId: 'formats-references',
    })
    const href = result.lesson.blocks[0].kind === 'attachment' ? result.lesson.blocks[0].href : ''
    expect(href).toBe('/course-media/formats-handout')
  })

  it('leaves public instructional images unchanged', async () => {
    const publicLesson = lesson('formats-references', '/media/sample-diagram.svg')
    const result = await resolveAuthorizedLessonMedia(node('formats-references'), publicLesson, {
      courseSlug: 'content-formats-demo',
      nodeId: 'formats-references',
    })
    expect(result.lesson.blocks[0]).toMatchObject({ href: '/media/sample-diagram.svg' })
  })

  it('fails closed for unregistered private media and ownership mismatch', async () => {
    await expect(
      resolveAuthorizedLessonMedia(node('formats-references'), lesson('formats-references', '/media/new.pdf'), {
        courseSlug: 'content-formats-demo',
        nodeId: 'formats-references',
      }),
    ).rejects.toThrow(/not registered/)
    await expect(
      resolveAuthorizedLessonMedia(node('wrong-node'), lesson('wrong-node'), {
        courseSlug: 'content-formats-demo',
        nodeId: 'wrong-node',
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
    })
    expect(result.node.video?.src).toBe('/course-media/os-video-en')
    expect(result.node.video?.captions?.[0].src).toBe('/course-media/os-captions-en')
    expect(JSON.stringify(result)).not.toContain('basic-os-linux/os-what-it-does/lesson-demo.mp4')
  })
})
