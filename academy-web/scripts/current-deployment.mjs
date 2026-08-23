#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const RFC3339_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be a non-empty string`)
  }
}

function assertNoDuplicateJsonMembers(json) {
  let index = 0

  function skipWhitespace() {
    while (index < json.length && /\s/.test(json[index])) index += 1
  }

  function parseString() {
    const start = index
    if (json[index] !== '"') throw new Error('deployment input is not valid JSON')
    index += 1
    while (index < json.length) {
      if (json[index] === '\\') {
        index += 2
      } else if (json[index] === '"') {
        index += 1
        try {
          return JSON.parse(json.slice(start, index))
        } catch {
          throw new Error('deployment input is not valid JSON')
        }
      } else {
        index += 1
      }
    }
    throw new Error('deployment input is not valid JSON')
  }

  function parseValue() {
    skipWhitespace()
    if (json[index] === '{') {
      index += 1
      const members = new Set()
      skipWhitespace()
      if (json[index] === '}') {
        index += 1
        return
      }
      while (index < json.length) {
        const member = parseString()
        if (members.has(member)) throw new Error(`duplicate JSON member: ${member}`)
        members.add(member)
        skipWhitespace()
        if (json[index] !== ':') throw new Error('deployment input is not valid JSON')
        index += 1
        parseValue()
        skipWhitespace()
        if (json[index] === '}') {
          index += 1
          return
        }
        if (json[index] !== ',') throw new Error('deployment input is not valid JSON')
        index += 1
        skipWhitespace()
      }
      throw new Error('deployment input is not valid JSON')
    }
    if (json[index] === '[') {
      index += 1
      skipWhitespace()
      if (json[index] === ']') {
        index += 1
        return
      }
      while (index < json.length) {
        parseValue()
        skipWhitespace()
        if (json[index] === ']') {
          index += 1
          return
        }
        if (json[index] !== ',') throw new Error('deployment input is not valid JSON')
        index += 1
      }
      throw new Error('deployment input is not valid JSON')
    }
    if (json[index] === '"') {
      parseString()
      return
    }

    const start = index
    while (index < json.length && !/[\s,}\]]/.test(json[index])) index += 1
    if (start === index) throw new Error('deployment input is not valid JSON')
  }

  parseValue()
  skipWhitespace()
  if (index !== json.length) throw new Error('deployment input is not valid JSON')
}

function daysInMonth(year, month) {
  if (month === 2) {
    const leapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    return leapYear ? 29 : 28
  }
  return [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
}

function parseTimestamp(value, name) {
  requiredString(value, name)

  const match = value.match(RFC3339_PATTERN)
  if (!match) throw new Error(`${name} is not a valid RFC3339 timestamp: ${value}`)

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = '', offset] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)

  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`${name} is not a valid RFC3339 timestamp: ${value}`)
  }
  if (hour > 23 || minute > 59 || second > 59 || offset === '-00:00') {
    throw new Error(`${name} is not a valid RFC3339 timestamp: ${value}`)
  }

  const offsetHours = offset === 'Z' ? 0 : Number(offset.slice(1, 3))
  const offsetMinutes = offset === 'Z' ? 0 : Number(offset.slice(4, 6))
  if (offset !== 'Z' && (offsetHours > 23 || offsetMinutes > 59)) {
    throw new Error(`${name} is not a valid RFC3339 timestamp: ${value}`)
  }

  const utcDate = new Date(0)
  utcDate.setUTCFullYear(year, month - 1, day)
  utcDate.setUTCHours(hour, minute, second, 0)
  const utcMilliseconds = utcDate.getTime()
  const offsetSeconds = (offset[0] === '-' ? -1 : 1) * (offsetHours * 3600 + offsetMinutes * 60)
  return {
    epochSeconds: BigInt(utcMilliseconds / 1000) - BigInt(offsetSeconds),
    fraction,
  }
}

function compareTimestamps(left, right) {
  if (left.epochSeconds !== right.epochSeconds) {
    return left.epochSeconds > right.epochSeconds ? 1 : -1
  }

  const width = Math.max(left.fraction.length, right.fraction.length)
  const leftFraction = left.fraction.padEnd(width, '0')
  const rightFraction = right.fraction.padEnd(width, '0')
  if (leftFraction === rightFraction) return 0
  return leftFraction > rightFraction ? 1 : -1
}

function parseVersion(version, deploymentIndex, versionIndex) {
  const name = `deployments[${deploymentIndex}].versions[${versionIndex}]`
  if (!isPlainObject(version)) throw new Error(`${name} must be an object`)

  requiredString(version.version_id, `${name}.version_id`)
  if (typeof version.percentage !== 'number' || !Number.isFinite(version.percentage) || version.percentage < 0 || version.percentage > 100) {
    throw new Error(`${name}.percentage must be a finite number between 0 and 100`)
  }

  return { id: version.version_id, percentage: version.percentage }
}

function parseDeployment(deployment, index) {
  const name = `deployments[${index}]`
  if (!isPlainObject(deployment)) throw new Error(`${name} must be an object`)

  requiredString(deployment.id, `${name}.id`)
  const createdOn = parseTimestamp(deployment.created_on, `${name}.created_on`)
  if (!Array.isArray(deployment.versions) || deployment.versions.length === 0) {
    throw new Error(`${name}.versions must be a non-empty array`)
  }

  return {
    id: deployment.id,
    created_on: deployment.created_on,
    versions: deployment.versions.map((version, versionIndex) => parseVersion(version, index, versionIndex)),
    timestamp: createdOn,
  }
}

export function selectCurrentDeployment(deployments) {
  if (!Array.isArray(deployments) || deployments.length === 0) {
    throw new Error('deployments must be a non-empty array')
  }

  const parsed = deployments.map(parseDeployment)
  let current = parsed[0]
  let currentTieCount = 1
  for (const deployment of parsed.slice(1)) {
    const comparison = compareTimestamps(deployment.timestamp, current.timestamp)
    if (comparison > 0) {
      current = deployment
      currentTieCount = 1
    } else if (comparison === 0) {
      currentTieCount += 1
    }
  }
  if (currentTieCount > 1) throw new Error('more than one deployment has the latest timestamp')

  return {
    id: current.id,
    created_on: current.created_on,
    versions: current.versions,
  }
}

export function parseCurrentDeploymentJson(json) {
  assertNoDuplicateJsonMembers(json)
  return selectCurrentDeployment(JSON.parse(json))
}

export function main(arguments_) {
  if (arguments_.length !== 1) throw new Error('usage: current-deployment.mjs <wrangler-deployments.json>')
  const [inputPath] = arguments_
  return parseCurrentDeploymentJson(readFileSync(inputPath, 'utf8'))
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null
if (entryUrl === import.meta.url) {
  try {
    console.log(JSON.stringify(main(process.argv.slice(2)), null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'failed to parse current deployment')
    process.exitCode = 1
  }
}
