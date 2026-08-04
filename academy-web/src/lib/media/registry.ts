export interface PrivateMediaAsset {
  id: string
  legacyPath: string
  key: string
  courseSlug: string
  nodeId: string
  contentType: string
}

export const PRIVATE_MEDIA_ASSETS: PrivateMediaAsset[] = [
  {
    id: 'os-video-en',
    legacyPath: '/media/lesson-demo.mp4',
    key: 'basic-os-linux/os-what-it-does/lesson-demo.mp4',
    courseSlug: 'basic-os-linux',
    nodeId: 'os-what-it-does',
    contentType: 'video/mp4',
  },
  {
    id: 'os-video-th',
    legacyPath: '/media/lesson-demo-th.mp4',
    key: 'basic-os-linux/os-what-it-does/lesson-demo-th.mp4',
    courseSlug: 'basic-os-linux',
    nodeId: 'os-what-it-does',
    contentType: 'video/mp4',
  },
  {
    id: 'os-captions-en',
    legacyPath: '/media/captions/os-what-it-does.en.vtt',
    key: 'basic-os-linux/os-what-it-does/os-what-it-does.en.vtt',
    courseSlug: 'basic-os-linux',
    nodeId: 'os-what-it-does',
    contentType: 'text/vtt; charset=utf-8',
  },
  {
    id: 'os-captions-th',
    legacyPath: '/media/captions/os-what-it-does.th.vtt',
    key: 'basic-os-linux/os-what-it-does/os-what-it-does.th.vtt',
    courseSlug: 'basic-os-linux',
    nodeId: 'os-what-it-does',
    contentType: 'text/vtt; charset=utf-8',
  },
  {
    id: 'formats-handout',
    legacyPath: '/media/sample-handout.pdf',
    key: 'content-formats-demo/formats-references/sample-handout.pdf',
    courseSlug: 'content-formats-demo',
    nodeId: 'formats-references',
    contentType: 'application/pdf',
  },
]

const byLegacyPath = new Map(PRIVATE_MEDIA_ASSETS.map((asset) => [asset.legacyPath, asset]))
const byKey = new Map(PRIVATE_MEDIA_ASSETS.map((asset) => [asset.key, asset]))
const byId = new Map(PRIVATE_MEDIA_ASSETS.map((asset) => [asset.id, asset]))

export function privateMediaByLegacyPath(path: string): PrivateMediaAsset | null {
  return byLegacyPath.get(path) ?? null
}

export function privateMediaByKey(key: string): PrivateMediaAsset | null {
  return byKey.get(key) ?? null
}

export function privateMediaById(id: string): PrivateMediaAsset | null {
  return byId.get(id) ?? null
}
