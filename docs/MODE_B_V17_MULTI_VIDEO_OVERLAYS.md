# Mode B V17 — Two local MP4 overlay layers

## Change

- Raised the native compositor limit from one to two distinct local MP4 assets per preset. Multiple Studio video elements that reference the same asset continue to share one decoder.
- Kept the aggregate native MP4 cache at 12 MiB across both clips; each individual clip remains subject to the existing 12 MiB upper bound, so a single large clip is still allowed but leaves less room for the second.
- Count and aggregate-byte validation now happen in the Android upload plugin as well as the TypeScript bridge. Replacing an existing asset ID does not consume another slot or double-count the replaced file.
- Updated Studio/Settings capability text to report the two-clip limit. Native render summaries now report the ready, playing, finished, and loading decoder counts rather than describing only the first clip.

## Safety and verification

- Each decoder retains its existing Android HandlerThread, 1280x720 maximum decoded frame, and 8 fps cadence. The total aggregate asset-size limit remains 12 MiB; the app still does not route MP4 audio to the stream.
- Added JVM policy tests for the two-asset limit, replacement behavior, and aggregate byte limit.
- Android/Gradle build and physical-device dual-video rendering remain required to validate hardware performance on target phones.
