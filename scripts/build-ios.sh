#!/bin/bash
set -euo pipefail
npm ci
npm run build
npx cap sync ios
mkdir -p build/ios
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -derivedDataPath build/ios/DerivedData \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO \
  CURRENT_PROJECT_VERSION="${BUILD_NUMBER:-${GITHUB_RUN_NUMBER:-1}}" \
  MARKETING_VERSION=2.0.0 build > build/ios/xcodebuild.log 2>&1 || { tail -n 100 build/ios/xcodebuild.log; exit 1; }
mkdir -p build/ios/Payload
cp -R build/ios/DerivedData/Build/Products/Release-iphoneos/App.app build/ios/Payload/PackCalendar.app
(cd build/ios && zip -qry PackCalendar-unsigned.ipa Payload)
echo 'Unsigned IPA: build/ios/PackCalendar-unsigned.ipa'
