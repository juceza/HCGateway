plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.compose.compiler) apply false
    alias(libs.plugins.hilt) apply false
    alias(libs.plugins.ksp) apply false
    alias(libs.plugins.google.services) apply false
    alias(libs.plugins.aboutlibraries) apply false
    // Spotless is applied (not `apply false`) at the root so a single config
    // formats every Kotlin file in the repo (app sources + the *.kts build
    // scripts). detekt is applied per-module (see app/build.gradle.kts).
    alias(libs.plugins.spotless)
    alias(libs.plugins.detekt) apply false
}

spotless {
    // ktlint follows the official Kotlin/Android style guide. The .editorconfig
    // documents these for the IDE; editorConfigOverride pins them for Spotless
    // (which does not always auto-discover .editorconfig) so CLI and IDE agree.
    val ktlintVersion = libs.versions.ktlint.get()
    val ktlintRules = mapOf(
        // Compose @Composable functions are PascalCase by convention.
        "ktlint_function_naming_ignore_when_annotated_with" to "Composable",
        // No hard line length — avoids a large one-off reformatting churn.
        "ktlint_standard_max-line-length" to "disabled",
        // Compose/Health Connect idiomatically use wildcard imports (material3.*,
        // records.* with 40+ types); the rule has no autofix, so allow them.
        "ktlint_standard_no-wildcard-imports" to "disabled",
    )

    kotlin {
        target("**/*.kt")
        targetExclude("**/build/**")
        ktlint(ktlintVersion).editorConfigOverride(ktlintRules)
    }
    kotlinGradle {
        target("**/*.kts")
        targetExclude("**/build/**")
        ktlint(ktlintVersion).editorConfigOverride(ktlintRules)
    }
}
