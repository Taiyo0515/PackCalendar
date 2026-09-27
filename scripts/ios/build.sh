#!/bin/bash
# Builds an unsigned IPA (with the widget) for SideStore. Requires macOS + Xcode.
set -euo pipefail
cd "$(dirname "$0")/../.."
VERSION=$(node -p "require('./package.json').version")
BUILD="${BUILD_NUMBER:-${GITHUB_RUN_NUMBER:-1}}"
OUT=build/ios
rm -rf "$OUT" && mkdir -p "$OUT"

xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -derivedDataPath "$OUT/DerivedData" \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" \
  MARKETING_VERSION="$VERSION" CURRENT_PROJECT_VERSION="$BUILD" \
  build > "$OUT/xcodebuild.log" 2>&1 || { tail -n 120 "$OUT/xcodebuild.log"; exit 1; }

APP="$OUT/Payload/PackCalendar.app"
mkdir -p "$OUT/Payload"
cp -R "$OUT/DerivedData/Build/Products/Release-iphoneos/App.app" "$APP"
test -d "$APP/PlugIns/PackWidget.appex" || { echo "Widget extension is missing"; exit 1; }

# Ad-hoc signatures carry the App Group entitlement so SideStore can register it.
if [ -d "$APP/Frameworks" ]; then
  find "$APP/Frameworks" -maxdepth 1 \( -name '*.framework' -o -name '*.dylib' \) -exec codesign -f -s - {} \;
fi
codesign -f -s - --entitlements ios/App/PackWidget/PackWidget.entitlements "$APP/PlugIns/PackWidget.appex"
codesign -f -s - --entitlements ios/App/App/App.entitlements "$APP"
codesign -d --entitlements - "$APP" | grep -q packcalendar || { echo "Entitlements were not embedded"; exit 1; }

(cd "$OUT" && zip -qry "PackCalendar-$VERSION.ipa" Payload)
shasum -a 256 "$OUT/PackCalendar-$VERSION.ipa" | tee "$OUT/PackCalendar-$VERSION.ipa.sha256"
echo "IPA: $OUT/PackCalendar-$VERSION.ipa"
