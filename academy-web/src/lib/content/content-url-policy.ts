const controlCharacters = /[\u0000-\u001f\u007f]/u

export function isSafeContentUrl(value: string): boolean {
  if (value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')) {
    return !controlCharacters.test(value)
  }

  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export function isSafeExternalContentUrl(value: string): boolean {
  if (controlCharacters.test(value)) return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}
