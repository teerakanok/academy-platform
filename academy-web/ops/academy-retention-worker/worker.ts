import { runRetention, type RetentionEnv } from './retention'

type RetentionWorkerHandler = {
  fetch(request: Request): Response
  scheduled(controller: unknown, env: RetentionEnv): Promise<void>
}

const worker: RetentionWorkerHandler = {
  fetch() {
    return new Response('Not found', { status: 404 })
  },

  async scheduled(_controller: unknown, env: RetentionEnv): Promise<void> {
    await runRetention(env)
  },
}

export default worker
