/** Validate the effective release configuration, including any operator overlay. */
export function assertAdmissionReleasePolicy(config) {
  const mode = config?.vars?.ACADEMY_ADMISSION_MODE
  if (mode !== 'open' && mode !== 'maintenance') {
    throw new Error('Release requires explicit ACADEMY_ADMISSION_MODE=open or maintenance')
  }
  if (config?.assets?.run_worker_first !== true || config?.assets?.not_found_handling === 'single-page-application') {
    throw new Error('Release requires every asset behind Worker admission and no SPA asset fallback')
  }
}

