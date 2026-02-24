# Lumina Mobile

This folder contains the native iOS and Android apps for Lumina.

## Structure
- `ios/` SwiftUI app (Xcode project)
- `android/` Kotlin + Jetpack Compose app (Gradle project)

## iOS
Open `mobile/ios/LuminaMobile.xcodeproj` in Xcode and run on a device or simulator.

## Android
From `mobile/android`:
```bash
./gradlew :app:assembleDebug
```
Open the folder in Android Studio for device/simulator runs.
