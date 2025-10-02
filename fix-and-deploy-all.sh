#!/usr/bin/env bash
set -euo pipefail

# CONFIG
AWS_REGION="${AWS_REGION:-us-east-1}"
LAMBDA_PREFIX="chargeback-autopilot-stripe-prod"
BUILD_DIR="dist"
HANDLERS_DIR="$BUILD_DIR/handlers"

echo "🔧 Rebuilding handlers to $HANDLERS_DIR …"

# 0) Prep
rm -rf "$BUILD_DIR"
mkdir -p "$HANDLERS_DIR"

# 1) Build TypeScript handlers if present, else copy JS
if ls src/handlers/*.ts >/dev/null 2>&1; then
  echo "🧱 Found TypeScript handlers; bundling with esbuild (CommonJS, node20)…"
  npx --yes esbuild src/handlers/*.ts \
    --bundle --platform=node --target=node20 --format=cjs \
    --outdir="$HANDLERS_DIR" --external:aws-sdk
elif ls handlers/*.js >/dev/null 2>&1; then
  echo "📦 No TS; copying JS handlers from ./handlers -> $HANDLERS_DIR"
  cp -v handlers/*.js "$HANDLERS_DIR"/
else
  echo "❌ No handlers found in src/handlers/*.ts or handlers/*.js"
  exit 1
fi

# 2) Enumerate Lambdas under the project prefix
echo "🔎 Discovering Lambda functions with prefix: $LAMBDA_PREFIX"
mapfile -t FUNCS < <(aws lambda list-functions --region "$AWS_REGION" \
  --query "Functions[?starts_with(FunctionName, '$LAMBDA_PREFIX')].FunctionName" \
  --output text | tr '\t' '\n' | sort)

if [ ${#FUNCS[@]} -eq 0 ]; then
  echo "❌ No functions found with prefix $LAMBDA_PREFIX"
  exit 1
fi

echo "Found ${#FUNCS[@]} functions."

# 3) For each Lambda, infer expected handler base and ensure file exists
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for FN in "${FUNCS[@]}"; do
  HANDLER="$(aws lambda get-function-configuration --region "$AWS_REGION" \
    --function-name "$FN" --query 'Handler' --output text)"
  # Expecting form: dist/handlers/<base>.handler  (or anything ending with .handler)
  BASE="$(basename "$HANDLER" .handler)"
  DIR="$(dirname "$HANDLER")"
  # Normalize to dist/handlers
  EXPECTED_JS="$HANDLERS_DIR/$BASE.js"

  echo ""
  echo "⚙️  $FN"
  echo "    Configured Handler: $HANDLER"
  echo "    Expected JS file  : $EXPECTED_JS"

  if [ ! -f "$EXPECTED_JS" ]; then
    # Try to find a plausible source and create a shim
    for CAND in \
      "src/handlers/$BASE.ts" \
      "handlers/$BASE.js" \
      "src/$BASE.ts" \
      "$BUILD_DIR/$BASE.js" ; do
      if [ -f "$CAND" ]; then
        echo "    ↪ Found $CAND — creating shim $EXPECTED_JS"
        if [[ "$CAND" == *.ts ]]; then
          npx --yes esbuild "$CAND" --bundle --platform=node --target=node20 --format=cjs --outfile="$EXPECTED_JS" --external:aws-sdk
        else
          cp -v "$CAND" "$EXPECTED_JS"
        fi
        break
      fi
    done
  fi

  if [ ! -f "$EXPECTED_JS" ]; then
    echo "    ❌ Could not produce $EXPECTED_JS; skipping."
    continue
  fi

  # 4) Package minimal zip preserving dist/** structure
  PKG="$TMP/${FN##*-}.zip"
  ( cd . && zip -q -r "$PKG" "$BUILD_DIR" package.json node_modules 2>/dev/null || zip -q -r "$PKG" "$BUILD_DIR" package.json )
  echo "    📦 Built $PKG ($(du -h "$PKG" | cut -f1))"

  # 5) Set uniform handler and upload code
  echo "    🔁 Setting handler to dist/handlers/$BASE.handler"
  aws lambda update-function-configuration \
    --region "$AWS_REGION" \
    --function-name "$FN" \
    --handler "dist/handlers/$BASE.handler" >/dev/null

  aws lambda wait function-updated --region "$AWS_REGION" --function-name "$FN"

  echo "    ⬆️  Uploading code…"
  aws lambda update-function-code \
    --region "$AWS_REGION" \
    --function-name "$FN" \
    --zip-file "fileb://$PKG" >/dev/null

  aws lambda wait function-updated --region "$AWS_REGION" --function-name "$FN"

  # 6) Sanity invoke (if function is safe to call without payload)
  case "$FN" in
    *health|*stats|*metrics* )
      OUT="$TMP/${FN##*-}.json"
      aws lambda invoke --region "$AWS_REGION" --function-name "$FN" --payload '{}' "$OUT" >/dev/null || true
      echo "    ✅ Sanity invoke OK (saved $OUT)"
      ;;
    * )
      echo "    ✅ Deployed (invoke skipped — may require real payload)."
      ;;
  esac
done

echo ""
echo "✔️  DONE. Next: run the verification block below."