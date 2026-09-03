import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { unstable_readConfig } from 'wrangler'

const CONFIG = join(__dirname, '..', '..', 'wrangler.jsonc')

describe('Cloudflare Worker runtime budget', () => {
  it('keeps the reviewed CPU ceiling and observability sampling source-owned', () => {
    const config = unstable_readConfig({ config: CONFIG })

    expect(config.compatibility_date).toBe('2025-03-25')
    expect(config.compatibility_flags).toEqual([
      'nodejs_compat',
      'nodejs_compat_populate_process_env',
      'global_fetch_strictly_public',
    ])
    expect(config.limits).toEqual({ cpu_ms: 500 })
    expect(config.observability).toEqual({
      enabled: true,
      logs: {
        enabled: true,
        head_sampling_rate: 0.1,
        invocation_logs: true,
      },
      traces: { enabled: false },
    })
  })
})
