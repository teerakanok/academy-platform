#!/usr/bin/env node
import { parseArgs, TARGETS_AL_09, TARGETS_AL_21 } from './common.mjs'

const args = parseArgs(process.argv)
const card = args.card || args.action || 'AL-09'

let fullTargets = TARGETS_AL_09
if (card === 'AL-21') {
  fullTargets = TARGETS_AL_21
}

const targets = fullTargets.map((t) => ({
  provider: t.provider,
  resource_id: t.resource_id,
}))

process.stdout.write(JSON.stringify({ targets }, null, 2) + '\n')
process.exit(0)
