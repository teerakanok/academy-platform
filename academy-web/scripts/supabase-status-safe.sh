#!/usr/bin/env bash
set -euo pipefail

# Supabase's env output includes local credentials. Preserve useful presence/length
# evidence while ensuring values never reach the terminal or agent transcript.
npx supabase status -o env 2>/dev/null | awk -F= '
  NF >= 2 {
    key = $1
    value = substr($0, index($0, "=") + 1)
    printf "%s=<set,len=%d>\n", key, length(value)
  }
  NF < 2 { print }
'
