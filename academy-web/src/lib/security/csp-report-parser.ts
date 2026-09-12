export const CSP_REPORT_MAX_BYTES = 8192
export const CSP_REPORT_MAX_ITEMS = 20

export type CspReportParse =
  | { ok: true; reportCount: number; directiveCategories: string[] }
  | { ok: false; status: 400 }

const LEGACY_REPORT_KEYS = new Set([
  'blocked-uri',
  'column-number',
  'disposition',
  'document-uri',
  'effective-directive',
  'line-number',
  'original-policy',
  'referrer',
  'script-sample',
  'source-file',
  'status-code',
  'violated-directive',
])

const REPORTING_REPORT_KEYS = new Set(['age', 'body', 'type', 'url', 'user_agent'])
const REPORTING_BODY_KEYS = new Set([
  'blockedURL',
  'columnNumber',
  'disposition',
  'documentURL',
  'effectiveDirective',
  'lineNumber',
  'originalPolicy',
  'referrer',
  'sample',
  'sourceFile',
])

const DIRECTIVE_CATEGORIES = new Set([
  'base',
  'connect',
  'default',
  'font',
  'form',
  'frame',
  'img',
  'manifest',
  'media',
  'object',
  'script',
  'style',
  'worker',
])

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).length <= allowed.size && Object.keys(value).every((key) => allowed.has(key))
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBoundedString(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 2048
}

function isBoundedNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000
}

function directiveCategory(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    if (!isBoundedString(candidate) || candidate.length > 128) continue
    const [name] = candidate.trim().toLowerCase().split(/\s+/u)
    const category = name?.split('-')[0] ?? ''
    if (DIRECTIVE_CATEGORIES.has(category)) return category
  }
  return 'other'
}

function parseLegacyReport(value: unknown): string | null {
  if (!isPlainObject(value) || !hasOnlyKeys(value, LEGACY_REPORT_KEYS)) return null
  if (!isBoundedString(value['violated-directive']) && !isBoundedString(value['effective-directive'])) return null
  for (const item of Object.values(value)) {
    if (isBoundedString(item) || isBoundedNumber(item)) continue
    return null
  }
  return directiveCategory(value['effective-directive'], value['violated-directive'])
}

function parseReportingReport(value: unknown): string | null {
  if (!isPlainObject(value) || !hasOnlyKeys(value, REPORTING_REPORT_KEYS)) return null
  if (value.type !== 'csp-violation') return null
  if ('age' in value && !isBoundedNumber(value.age)) return null
  if ('url' in value && !isBoundedString(value.url)) return null
  if ('user_agent' in value && !isBoundedString(value.user_agent)) return null
  if (!isPlainObject(value.body) || !hasOnlyKeys(value.body, REPORTING_BODY_KEYS)) return null
  if (!isBoundedString(value.body.effectiveDirective)) return null
  for (const item of Object.values(value.body)) {
    if (isBoundedString(item) || isBoundedNumber(item)) continue
    return null
  }
  return directiveCategory(value.body.effectiveDirective)
}

export function parseCspReportBody(
  value: unknown,
  mediaType: string,
): CspReportParse {
  if (mediaType === 'application/csp-report') {
    const category = isPlainObject(value) && isPlainObject(value['csp-report'])
      ? parseLegacyReport(value['csp-report'])
      : null
    return category ? {
      ok: true,
      reportCount: 1,
      directiveCategories: [category],
    } : { ok: false, status: 400 }
  }

  if (mediaType === 'application/reports+json') {
    if (!Array.isArray(value) || value.length === 0 || value.length > CSP_REPORT_MAX_ITEMS) {
      return { ok: false, status: 400 }
    }
    const categories: string[] = []
    for (const report of value) {
      const category = parseReportingReport(report)
      if (!category) return { ok: false, status: 400 }
      if (!categories.includes(category)) categories.push(category)
    }
    return { ok: true, reportCount: value.length, directiveCategories: categories.sort() }
  }

  return { ok: false, status: 400 }
}


