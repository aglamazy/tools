#!/bin/bash
# Build script — packages the extension as a .zip for distribution

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$PROJECT_ROOT/public/extension"
OUTPUT_FILE="$OUTPUT_DIR/aglamaz-form-assistant.zip"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Remove old build
rm -f "$OUTPUT_FILE"

# Package extension (exclude build script and dev files)
cd "$SCRIPT_DIR"
zip -r "$OUTPUT_FILE" \
  manifest.json \
  background.js \
  sidebar/ \
  popup/ \
  icons/ \
  -x "*.DS_Store" "build.sh"

echo "Extension packaged: $OUTPUT_FILE"
echo "Size: $(du -h "$OUTPUT_FILE" | cut -f1)"
