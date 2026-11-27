StreamingIn APK — Full Product Reference

1. Purpose

The StreamingIn APK is provided as a comprehensive reference benchmark for the SYNTXRR STREAM project.

It is intended to serve as a reference for the overall product experience, technical architecture, feature implementation, user interface, workflows, integrations, and system behavior.

StreamingIn is a reference for the entire SYNTXRR product, not just one individual feature.

The objective is to study how StreamingIn implements its capabilities and identify ideas, patterns, and technical approaches that can help SYNTXRR achieve comparable usability, reliability, and functionality.

2. Reference Scope

Analyze all accessible and relevant aspects of the APK, including but not limited to:

- Overall application architecture and module organization.
- User interface, UX, navigation, layouts, and interaction patterns.
- Dashboard, settings, configuration, and user workflows.
- Streaming modes and broadcasting workflows.
- TikTok LIVE integration and event handling.
- Chat, comments, gifts, likes, follows, and viewer interactions.
- Song Request, music catalog, search providers, matching, queues, and playback.
- TTS, audio routing, microphone, soundboard, and audio mixer.
- Floating HUD, overlays, widgets, and background services.
- RTMP configuration, streaming engine, camera, and screen capture.
- Studio, elements, presets, groups, media management, import, and export.
- Storage, persistence, session management, and lifecycle handling.
- Network communication, APIs, WebSocket connections, and event processing.
- Error handling, reconnection, resource management, and performance.
- Permissions, privacy boundaries, and security practices.
- Other features or implementation details discovered during inspection.

3. Audit Objectives

For each accessible feature or system:

1. Identify what the feature does.
2. Determine how the feature works internally where possible.
3. Identify relevant classes, components, services, libraries, and communication flows.
4. Document its inputs, outputs, dependencies, and lifecycle.
5. Examine its UI and user interaction behavior.
6. Identify technical patterns that could be adapted for SYNTXRR.
7. Distinguish verified findings from assumptions or items that cannot be confirmed.

Do not assume that a feature exists or works merely because its name appears in the APK.

4. SYNTXRR Reference Principles

Use StreamingIn as a benchmark and source of technical inspiration.

The objective is not to blindly copy its implementation. Instead, identify suitable approaches that can be adapted to SYNTXRR's existing architecture, technology stack, requirements, and product direction.

Preserve SYNTXRR's own identity and existing functionality.

5. Strict Audit Restrictions

During the reference audit:

- Do not modify SYNTXRR application source code.
- Do not modify package files, dependencies, Gradle files, Android manifests, workflows, or build configuration.
- Do not modify Mode A, Mode B, RootEncoder, Studio, presets, or existing integrations.
- Do not replace existing SYNTXRR architecture based on assumptions.
- Do not include the reference APK in the production application or APK build.
- Do not copy proprietary assets, branding, credentials, private keys, or copyrighted content.
- Do not bypass DRM, authentication, access controls, or other security protections.

This APK is strictly an analysis reference.

6. Expected Audit Deliverables

Produce a structured technical report containing:

- Complete feature inventory.
- Architecture and module overview.
- UI/UX and navigation analysis.
- Feature-by-feature implementation findings.
- Important classes, components, services, and dependencies.
- Network and event-flow diagrams where possible.
- Streaming and audio workflow analysis.
- Song Request and provider analysis.
- Comparison opportunities for SYNTXRR.
- Verified findings, uncertain findings, and limitations.
- Prioritized recommendations for future SYNTXRR development.

Save the report separately as:

"docs/audit/STREAMINGIN_FULL_PRODUCT_REFERENCE_AUDIT.md"

7. Final Instruction

First inspect and analyze the reference APK.

Do not implement changes in SYNTXRR during this audit.

The purpose of this reference is to understand how StreamingIn achieves its overall functionality and user experience, so that SYNTXRR can be improved systematically without breaking its existing working features.
