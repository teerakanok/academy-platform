import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync, execSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const REPO_ROOT = join(__dirname, '../../..')
const OPS_DIR = join(__dirname, '../../ops')
const RUNBOOKS_DIR = join(OPS_DIR, 'runbooks')
const RELEASE_DIR = join(OPS_DIR, 'release')
const GOVERNANCE_DIR = '/Users/teerakanok/Dev/cyberskills-director-governance/scripts'

describe('Academy live-ops runbooks and release scripts (AL-23)', () => {
  const tempTestDir = join(__dirname, '../../.test-ops-env')
  const tempBinDir = join(tempTestDir, 'bin')
  const tempStateDir = join(tempTestDir, 'state')

  beforeAll(() => {
    rmSync(tempTestDir, { recursive: true, force: true })
    mkdirSync(tempBinDir, { recursive: true, mode: 0o755 })
    mkdirSync(tempStateDir, { recursive: true, mode: 0o700 })

    // Create fake wrangler on PATH for testing upload and deploy
    const fakeWranglerScript = `#!/usr/bin/env bash
if [[ "$1" == "versions" && "$2" == "upload" ]]; then
  echo "Uploaded version a1b2c3d4-1234-5678-9abc-def012345678"
  exit 0
elif [[ "$1" == "deployments" && "$2" == "list" ]]; then
  echo "Deployment 733e4fa3-52c4-4717-b3da-aed3aafe5023 serving prev-00000000-1111-2222-3333-444444444444 at 100%"
  exit 0
elif [[ "$1" == "versions" && "$2" == "deploy" ]]; then
  echo "Successfully deployed $3 to 100% traffic"
  exit 0
fi
echo "Fake wrangler called with: $@"
exit 0
`
    const fakeWranglerPath = join(tempBinDir, 'wrangler')
    writeFileSync(fakeWranglerPath, fakeWranglerScript, { mode: 0o755 })
    chmodSync(fakeWranglerPath, 0o755)
  })

  afterAll(() => {
    rmSync(tempTestDir, { recursive: true, force: true })
  })

  describe('Manifest schema validation with gathering_ops._validate_manifest', () => {
    it('validates AL-09.json through gathering_ops._validate_manifest', () => {
      const script = `
import sys, json
sys.path.insert(0, '${GOVERNANCE_DIR}')
from gathering_ops import _validate_manifest

with open('${join(RUNBOOKS_DIR, 'AL-09.json')}', 'r', encoding='utf-8') as f:
    data = json.load(f)
validated = _validate_manifest(data)
print(json.dumps({'schema': validated['schema'], 'targets': len(validated['targets']), 'steps': len(validated['steps'])}))
`
      const result = execFileSync('python3', ['-c', script], { encoding: 'utf8' })
      const parsed = JSON.parse(result.trim())
      expect(parsed.schema).toBe('gathering-ops/v1')
      expect(parsed.targets).toBe(2)
      expect(parsed.steps).toBe(8)
    })

    it('validates AL-21.json through gathering_ops._validate_manifest', () => {
      const script = `
import sys, json
sys.path.insert(0, '${GOVERNANCE_DIR}')
from gathering_ops import _validate_manifest

with open('${join(RUNBOOKS_DIR, 'AL-21.json')}', 'r', encoding='utf-8') as f:
    data = json.load(f)
validated = _validate_manifest(data)
print(json.dumps({'schema': validated['schema'], 'targets': len(validated['targets']), 'steps': len(validated['steps'])}))
`
      const result = execFileSync('python3', ['-c', script], { encoding: 'utf8' })
      const parsed = JSON.parse(result.trim())
      expect(parsed.schema).toBe('gathering-ops/v1')
      expect(parsed.targets).toBe(1)
      expect(parsed.steps).toBe(5)
    })

    it('verifies that all execution_inputs exist on disk in the repository', () => {
      for (const card of ['AL-09', 'AL-21']) {
        const manifest = JSON.parse(readFileSync(join(RUNBOOKS_DIR, `${card}.json`), 'utf8'))
        for (const inputPath of manifest.execution_inputs) {
          const absolutePath = join(REPO_ROOT, inputPath)
          expect(existsSync(absolutePath)).toBe(true)
        }
      }
    })

    it('verifies that writable_outputs do not overlap execution_inputs or each other', () => {
      for (const card of ['AL-09', 'AL-21']) {
        const manifest = JSON.parse(readFileSync(join(RUNBOOKS_DIR, `${card}.json`), 'utf8'))
        const inputs = manifest.execution_inputs
        const outputs = manifest.writable_outputs

        for (const out of outputs) {
          for (const inp of inputs) {
            expect(out === inp || out.startsWith(inp + '/') || inp.startsWith(out + '/')).toBe(false)
          }
        }

        for (let i = 0; i < outputs.length; i++) {
          for (let j = i + 1; j < outputs.length; j++) {
            expect(outputs[i].startsWith(outputs[j] + '/') || outputs[j].startsWith(outputs[i] + '/')).toBe(false)
          }
        }
      }
    })
  })

  describe('Target identity probes', () => {
    it('returns exact Cloudflare and PostgreSQL targets for AL-09', () => {
      const output = execSync(
        `node "${join(RELEASE_DIR, 'target-identity.mjs')}" AL-09`,
        { cwd: REPO_ROOT, encoding: 'utf8' }
      )
      const data = JSON.parse(output.trim())
      expect(data.targets).toEqual([
        { provider: 'cloudflare', resource_id: 'worker:cyberskills-academy' },
        { provider: 'ssh', resource_id: 'host:ssh-db.cyberskills.co.th:supabase-db:postgres:academy' },
      ])
    })

    it('returns exact Cloudflare target for AL-21', () => {
      const output = execSync(
        `node "${join(RELEASE_DIR, 'target-identity.mjs')}" AL-21`,
        { cwd: REPO_ROOT, encoding: 'utf8' }
      )
      const data = JSON.parse(output.trim())
      expect(data.targets).toEqual([
        { provider: 'cloudflare', resource_id: 'worker:cyberskills-academy' },
      ])
    })
  })

  describe('Database backup script rehearsal (AL-09)', () => {
    const cardState = join(tempStateDir, 'AL-09')

    it('creates 0600 backup file and valid receipt on rehearsal run', () => {
      const runOut = execSync(
        `node "${join(RELEASE_DIR, 'db-backup.mjs')}" run --card AL-09 --dry-run --state-dir "${cardState}"`,
        { cwd: REPO_ROOT, encoding: 'utf8' }
      )
      expect(runOut).toContain('Database backup verified')

      const receipt = JSON.parse(readFileSync(join(cardState, 'db-backup.json'), 'utf8'))
      expect(receipt.backup_verified).toBe(true)
      expect(receipt.mode).toBe('0600')
      expect(receipt.sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(receipt.bytes).toBeGreaterThan(0)
      expect(receipt.archiveListEntries).toBeGreaterThan(0)
    })

    it('reports matches_expected on check probe', () => {
      const checkOut = execSync(
        `node "${join(RELEASE_DIR, 'db-backup.mjs')}" check --card AL-09 --state-dir "${cardState}"`,
        { cwd: REPO_ROOT, encoding: 'utf8' }
      )
      const checkData = JSON.parse(checkOut.trim())
      expect(checkData.status).toBe('matches_expected')
      expect(checkData.observed).toEqual({ backup_verified: true, mode: '0600' })
    })

    it('remains idempotent on repeated run', () => {
      const rerunOut = execSync(
        `node "${join(RELEASE_DIR, 'db-backup.mjs')}" run --card AL-09 --dry-run --state-dir "${cardState}"`,
        { cwd: REPO_ROOT, encoding: 'utf8' }
      )
      expect(rerunOut).toContain('already recorded and verified')
    })
  })

  describe('Database migration script rehearsal (AL-09)', () => {
    const cardState = join(tempStateDir, 'AL-09')

    it('rehearses and applies 0041, then confirms with check probe', () => {
      // 1. Initial check before apply
      const initialCheck = execSync(
        `node "${join(RELEASE_DIR, 'db-migration.mjs')}" check --migration 0041 --card AL-09 --dry-run --state-dir "${cardState}"`,
        { cwd: REPO_ROOT, encoding: 'utf8' }
      )
      expect(JSON.parse(initialCheck.trim()).status).toBe('not_applied')

      // 2. Apply 0041
      const applyOut = execSync(
        `node "${join(RELEASE_DIR, 'db-migration.mjs')}" apply --migration 0041 --card AL-09 --dry-run --state-dir "${cardState}"`,
        { cwd: REPO_ROOT, encoding: 'utf8' }
      )
      expect(applyOut).toContain('Migration 0041')

      // 3. Check reports matches_expected
      const postCheck = execSync(
        `node "${join(RELEASE_DIR, 'db-migration.mjs')}" check --migration 0041 --card AL-09 --dry-run --state-dir "${cardState}"`,
        { cwd: REPO_ROOT, encoding: 'utf8' }
      )
      const checkData = JSON.parse(postCheck.trim())
      expect(checkData.status).toBe('matches_expected')
      expect(checkData.observed).toEqual({ migration: '0041', service_role_grants_absent: true })

      // 4. Second apply reports already applied (idempotency)
      const secondApply = execSync(
        `node "${join(RELEASE_DIR, 'db-migration.mjs')}" apply --migration 0041 --card AL-09 --dry-run --state-dir "${cardState}"`,
        { cwd: REPO_ROOT, encoding: 'utf8' }
      )
      expect(secondApply).toContain('already applied')
    })

    it('rehearses and applies 0042, then confirms with check probe', () => {
      // 1. Initial check before apply
      const initialCheck = execSync(
        `node "${join(RELEASE_DIR, 'db-migration.mjs')}" check --migration 0042 --card AL-09 --dry-run --state-dir "${cardState}"`,
        { cwd: REPO_ROOT, encoding: 'utf8' }
      )
      expect(JSON.parse(initialCheck.trim()).status).toBe('not_applied')

      // 2. Apply 0042
      const applyOut = execSync(
        `node "${join(RELEASE_DIR, 'db-migration.mjs')}" apply --migration 0042 --card AL-09 --dry-run --state-dir "${cardState}"`,
        { cwd: REPO_ROOT, encoding: 'utf8' }
      )
      expect(applyOut).toContain('Migration 0042')

      // 3. Check reports matches_expected
      const postCheck = execSync(
        `node "${join(RELEASE_DIR, 'db-migration.mjs')}" check --migration 0042 --card AL-09 --dry-run --state-dir "${cardState}"`,
        { cwd: REPO_ROOT, encoding: 'utf8' }
      )
      const checkData = JSON.parse(postCheck.trim())
      expect(checkData.status).toBe('matches_expected')
      expect(checkData.observed).toEqual({ migration: '0042', course_visibility_enforced: true })

      // 4. Second apply reports already applied (idempotency)
      const secondApply = execSync(
        `node "${join(RELEASE_DIR, 'db-migration.mjs')}" apply --migration 0042 --card AL-09 --dry-run --state-dir "${cardState}"`,
        { cwd: REPO_ROOT, encoding: 'utf8' }
      )
      expect(secondApply).toContain('already applied')
    })
  })

  describe('Worker build, upload and deploy with fake wrangler on PATH', () => {
    const cardState = join(tempStateDir, 'AL-09')
    const testEnv = {
      ...process.env,
      PATH: `${tempBinDir}:${process.env.PATH}`,
    }

    it('runs build-cf in rehearsal mode and verifies artifact', () => {
      const runOut = execSync(
        `node "${join(RELEASE_DIR, 'build-cf.mjs')}" run --card AL-09 --dry-run --state-dir "${cardState}"`,
        { cwd: REPO_ROOT, encoding: 'utf8' }
      )
      expect(runOut).toContain('build artifact')

      const checkOut = execSync(
        `node "${join(RELEASE_DIR, 'build-cf.mjs')}" check --card AL-09 --state-dir "${cardState}"`,
        { cwd: REPO_ROOT, encoding: 'utf8' }
      )
      expect(JSON.parse(checkOut.trim()).status).toBe('matches_expected')
    })

    it('uploads version via fake wrangler and records candidate version ID', () => {
      const runOut = execSync(
        `node "${join(RELEASE_DIR, 'versions-upload.mjs')}" run --card AL-09 --state-dir "${cardState}"`,
        { cwd: REPO_ROOT, env: testEnv, encoding: 'utf8' }
      )
      expect(runOut).toContain('Candidate version recorded')

      const receipt = JSON.parse(readFileSync(join(cardState, 'versions-upload.json'), 'utf8'))
      expect(receipt.uploaded).toBe(true)
      expect(receipt.candidate_version_id).toBe('a1b2c3d4-1234-5678-9abc-def012345678')

      const checkOut = execSync(
        `node "${join(RELEASE_DIR, 'versions-upload.mjs')}" check --card AL-09 --state-dir "${cardState}"`,
        { cwd: REPO_ROOT, env: testEnv, encoding: 'utf8' }
      )
      expect(JSON.parse(checkOut.trim()).status).toBe('matches_expected')
    })

    it('deploys candidate to 100% traffic and records previous version ID for rollback', () => {
      const runOut = execSync(
        `node "${join(RELEASE_DIR, 'deploy-100.mjs')}" run --card AL-09 --state-dir "${cardState}"`,
        { cwd: REPO_ROOT, env: testEnv, encoding: 'utf8' }
      )
      expect(runOut).toContain('Deployment active at 100%')

      const receipt = JSON.parse(readFileSync(join(cardState, 'deploy-100.json'), 'utf8'))
      expect(receipt.candidate_version_id).toBe('a1b2c3d4-1234-5678-9abc-def012345678')
      expect(receipt.previous_version_id).toBe('733e4fa3-52c4-4717-b3da-aed3aafe5023')
      expect(receipt.traffic_percentage).toBe(100)

      const checkOut = execSync(
        `node "${join(RELEASE_DIR, 'deploy-100.mjs')}" check --card AL-09 --state-dir "${cardState}"`,
        { cwd: REPO_ROOT, env: testEnv, encoding: 'utf8' }
      )
      expect(JSON.parse(checkOut.trim()).status).toBe('matches_expected')
    })

    it('runs postcheck in rehearsal mode and confirms pass', () => {
      const runOut = execSync(
        `node "${join(RELEASE_DIR, 'postcheck.mjs')}" run --card AL-09 --dry-run --state-dir "${cardState}"`,
        { cwd: REPO_ROOT, encoding: 'utf8' }
      )
      expect(runOut).toContain('Postcheck verified')

      const checkOut = execSync(
        `node "${join(RELEASE_DIR, 'postcheck.mjs')}" check --card AL-09 --state-dir "${cardState}"`,
        { cwd: REPO_ROOT, encoding: 'utf8' }
      )
      expect(JSON.parse(checkOut.trim()).status).toBe('matches_expected')
    })
  })
})
