#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  printf 'usage: %s <destination> <repeat>\n' "$0" >&2
  exit 2
fi

left=$(realpath -- "$1")
right=$(realpath -- "$2")
for root in "$left" "$right"; do
  [[ -d "$root/theme" ]] || { printf 'missing theme directory: %s\n' "$root" >&2; exit 1; }
  [[ -f "$root/theme.zip" ]] || { printf 'missing theme.zip: %s\n' "$root" >&2; exit 1; }
  [[ -f "$root/theme/report.json" ]] || { printf 'missing theme/report.json: %s\n' "$root" >&2; exit 1; }
done

diff -ru -- "$left/theme" "$right/theme"
cmp -- "$left/theme.zip" "$right/theme.zip"
cmp -- "$left/theme/report.json" "$right/theme/report.json"

manifest() {
  local root=$1 output=$2
  (
    cd -- "$root"
    sha256sum -- theme.zip
    find theme -type f -print0 | LC_ALL=C sort -z | while IFS= read -r -d '' file; do
      sha256sum -- "$file"
    done
    for identity in project.json package.json pnpm-lock.yaml package-lock.json; do
      if [[ -f "$identity" ]]; then sha256sum -- "$identity"; else printf 'MISSING  %s\n' "$identity"; fi
    done
  ) | LC_ALL=C sort > "$output"
}

manifest "$left" "${left}.sha256"
manifest "$right" "${right}.sha256"
cmp -- "${left}.sha256" "${right}.sha256"
printf 'deterministic theme outputs match; manifests: %s.sha256 %s.sha256\n' "$left" "$right"
