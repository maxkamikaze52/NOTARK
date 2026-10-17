#!/bin/bash
# Set the Finder icon of an app from a PNG.
#
#   ./set_icon.sh <logo.png> <App.app> [IconName]
#
# The PNG is converted to .icns, copied into the bundle's Resources/ and wired
# up in Info.plist (CFBundleIconFile), then the icon cache is refreshed so
# Finder shows it immediately. IconName defaults to the app's name.
set -euo pipefail

SRC="${1:?usage: set_icon.sh <logo.png> <App.app> [IconName]}"
APP="${2:?usage: set_icon.sh <logo.png> <App.app> [IconName]}"
NAME="${3:-$(basename "$APP" .app)}"

[ -f "$SRC" ] || { echo "no such image: $SRC" >&2; exit 1; }
[ -d "$APP" ] || { echo "no such app: $APP" >&2; exit 1; }

HERE="$(cd "$(dirname "$0")" && pwd)"
ICNS="$HERE/build/$NAME.icns"

python3 "$HERE/make_icns.py" "$SRC" "$ICNS"

RES="$APP/Contents/Resources"
mkdir -p "$RES"
cp "$ICNS" "$RES/$NAME.icns"

PLIST="$APP/Contents/Info.plist"
if [ -f "$PLIST" ]; then
  if /usr/libexec/PlistBuddy -c "Print :CFBundleIconFile" "$PLIST" >/dev/null 2>&1; then
    /usr/libexec/PlistBuddy -c "Set :CFBundleIconFile $NAME" "$PLIST"
  else
    /usr/libexec/PlistBuddy -c "Add :CFBundleIconFile string $NAME" "$PLIST"
  fi
fi

# Re-sign (ad-hoc) so macOS keeps any permissions the app was granted.
# Strip extended attributes first: Finder info left on the bundle makes
# codesign fail with "resource fork, Finder information ... not allowed".
xattr -cr "$APP" 2>/dev/null || true
codesign --force --deep --sign - "$APP" 2>/dev/null || true

# Refresh the icon cache so Finder redraws the icon right away.
touch "$APP"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
  -f "$APP" >/dev/null 2>&1 || true

echo "Icon set: $APP  <-  $SRC"
