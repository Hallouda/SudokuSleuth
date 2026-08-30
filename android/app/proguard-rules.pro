# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# --- Sudoku Sleuth release keeps (minifyEnabled true) ---
# Capacitor and the AdMob / Play Services Ads SDK ship their own consumer
# ProGuard rules, so most keeps are automatic. These are belt-and-braces for
# the WebView bridge, which R8 can't see is reachable from JS.

# @JavascriptInterface methods called from www/ JS
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Capacitor plugin surface (redundant with the bundled consumer rules, kept
# explicit so a plugin that forgets to ship them still works)
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * { *; }
-keep public class * extends com.getcapacitor.Plugin { *; }

# Keep source/line info in crash reports (Crashlytics-friendly once wired)
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
