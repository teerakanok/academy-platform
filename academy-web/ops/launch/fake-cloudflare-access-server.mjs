import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'

export const FAKE_ACCOUNT_KEY = 'fake-account'
export const FAKE_API_TOKEN = 'fake-token'

export function startFakeCloudflareAccessServer() {
  const applications = [
    {
      id: '72f37caa-6573-4898-8bd1-b4aaaba741cc',
      name: 'Academy canonical gated site',
      domain: 'academy.cyberskills.co.th',
      path: '',
      session_duration: '24h',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ]
  const policies = new Map([
    ['72f37caa-6573-4898-8bd1-b4aaaba741cc', [
      {
        id: 'd5aa4dcf-f77c-4b63-b14f-5c2dc909fff2',
        name: 'Academy owner allow',
        decision: 'allow',
        include: [{ email: { email: 'owner@example.test' } }],
        precedence: 1,
      },
    ]],
  ])

  function envelope(result) {
    return { success: true, errors: [], messages: [], result }
  }

  function readBody(request) {
    return new Promise((resolve, reject) => {
      const chunks = []
      request.on('data', (chunk) => chunks.push(chunk))
      request.on('end', () => {
        try {
          resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {})
        } catch (error) {
          reject(error)
        }
      })
      request.on('error', reject)
    })
  }

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (!url.pathname.startsWith('/accounts/')) {
        const gated = ['/admin', '/player'].some((path) => url.pathname === path || url.pathname.startsWith(`${path}/`))
        response.writeHead(gated ? 302 : 302, {
          location: 'https://test.cloudflareaccess.com/cdn-cgi/access/login/issuer',
        })
        response.end()
        return
      }
      if (request.headers.authorization !== `Bearer ${FAKE_API_TOKEN}`) {
        response.writeHead(401).end(JSON.stringify({ success: false, errors: ['unauthorized'] }))
        return
      }
      const prefix = `/accounts/${FAKE_ACCOUNT_KEY}/access/apps`
      const applicationMatch = /^\/accounts\/[^/]+\/access\/apps\/([^/]+)(\/policies)?$/.exec(url.pathname)
      if (request.method === 'GET' && url.pathname === prefix) {
        response.writeHead(200).end(JSON.stringify(envelope(applications)))
        return
      }
      if (request.method === 'GET' && applicationMatch?.[2] === '/policies') {
        response.writeHead(200).end(JSON.stringify(envelope(policies.get(applicationMatch[1]) ?? [])))
        return
      }
      if (request.method === 'POST' && url.pathname === prefix) {
        const application = { ...(await readBody(request)), id: randomUUID(), created_at: '2026-01-02T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' }
        applications.push(application)
        policies.set(application.id, [])
        nextId += 1
        response.writeHead(201).end(JSON.stringify(envelope(application)))
        return
      }
      if (request.method === 'POST' && applicationMatch?.[2] === '/policies') {
        const policy = { ...(await readBody(request)), id: randomUUID() }
        policies.get(applicationMatch[1]).push(policy)
        response.writeHead(201).end(JSON.stringify(envelope(policy)))
        return
      }
      if (request.method === 'PUT' && applicationMatch) {
        const id = applicationMatch[1]
        const index = applications.findIndex((application) => application.id === id)
        if (index === -1) {
          response.writeHead(404).end(JSON.stringify({ success: false, errors: ['not found'] }))
          return
        }
        applications[index] = {
          ...applications[index],
          ...(await readBody(request)),
          id,
          updated_at: '2026-01-03T00:00:00Z',
        }
        response.writeHead(200).end(JSON.stringify(envelope(applications[index])))
        return
      }
      if (request.method === 'DELETE' && applicationMatch) {
        const id = applicationMatch[1]
        const index = applications.findIndex((application) => application.id === id)
        if (index === -1) {
          response.writeHead(404).end(JSON.stringify({ success: false, errors: ['not found'] }))
          return
        }
        applications.splice(index, 1)
        policies.delete(id)
        response.writeHead(200).end(JSON.stringify(envelope({ id })))
        return
      }
      response.writeHead(404).end(JSON.stringify({ success: false, errors: ['not found'] }))
    } catch {
      response.writeHead(500).end(JSON.stringify({ success: false, errors: ['invalid request'] }))
    }
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        origin: `http://127.0.0.1:${server.address().port}`,
        applications,
        policies,
      })
    })
  })
}
