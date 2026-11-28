#!/usr/bin/env bash
# Usage: sign-aab.sh <in.aab> <out.aab> <keystore.properties>
# Re-signs an AAB with the upload key described in keystore.properties (storeFile/storePassword/keyAlias/keyPassword).
set -euo pipefail
IN=$1 OUT=$2 PROPS=$3
get() { grep "^$1=" "$PROPS" | cut -d= -f2-; }
DIR=$(cd "$(dirname "$PROPS")" && pwd)
STORE=$(get storeFile); [[ $STORE = /* ]] || STORE="$DIR/$STORE"
ALIAS=$(get keyAlias); SP=$(get storePassword); KP=$(get keyPassword); KP=${KP:-$SP}
export SP KP
JBIN=$( [ -x /opt/homebrew/opt/openjdk@21/bin/jarsigner ] && echo /opt/homebrew/opt/openjdk@21/bin || echo /opt/homebrew/opt/openjdk@17/bin )
cp "$IN" "$OUT"
zip -q -d "$OUT" 'META-INF/*.SF' 'META-INF/*.RSA' 'META-INF/*.EC' 'META-INF/*.DSA' 'META-INF/MANIFEST.MF' 2>/dev/null || true
"$JBIN/jarsigner" -keystore "$STORE" -storepass:env SP -keypass:env KP -sigalg SHA256withRSA -digestalg SHA-256 "$OUT" "$ALIAS" >/dev/null
"$JBIN/jarsigner" -verify "$OUT" >/dev/null && echo "signed: $OUT"
"$JBIN/keytool" -list -keystore "$STORE" -storepass:env SP -alias "$ALIAS" | grep -i 'SHA' || true
