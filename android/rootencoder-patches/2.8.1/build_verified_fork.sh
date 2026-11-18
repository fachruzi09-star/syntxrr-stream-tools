#!/usr/bin/env bash
set -Eeuo pipefail

# Build the patched RootEncoder 2.8.1 fork in its own Gradle build.
# This script never edits SYNTXRR's Gradle files or dependency coordinates.

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PATCH_DIR="$SCRIPT_DIR"
ROOTENCODER_DIR="${1:-${ROOTENCODER_CHECKOUT:-}}"

if [[ -z "$ROOTENCODER_DIR" ]]; then
  echo "Usage: $0 /path/to/clean/RootEncoder-2.8.1-checkout" >&2
  exit 2
fi
ROOTENCODER_DIR="$(cd -- "$ROOTENCODER_DIR" && pwd)"

if ! command -v java >/dev/null 2>&1; then
  echo "ERROR: Java is required. Use JDK 21 for the pinned RootEncoder toolchain." >&2
  exit 2
fi
JAVA_MAJOR="$(java -version 2>&1 | awk -F '[\".]' '/version/ {print $2; exit}')"
if [[ -z "$JAVA_MAJOR" || "$JAVA_MAJOR" -lt 17 ]]; then
  echo "ERROR: RootEncoder 2.8.1 requires JDK 17 or newer; detected: ${JAVA_MAJOR:-unknown}" >&2
  exit 2
fi

if [[ ! -f "$ROOTENCODER_DIR/gradlew" ]]; then
  echo "ERROR: Gradle wrapper not found in $ROOTENCODER_DIR" >&2
  exit 2
fi

# This operation is explicit because invoking this script opts into patching
# the supplied isolated RootEncoder checkout.
python3 "$PATCH_DIR/apply_verified_patch.py" "$ROOTENCODER_DIR" --apply

MODULES=(common encoder rtmp rtsp srt udp whip library)
TEST_TASKS=()
for module in "${MODULES[@]}"; do
  TEST_TASKS+=(":${module}:testDebugUnitTest")
done

(
  cd "$ROOTENCODER_DIR"
  bash ./gradlew --no-daemon --stacktrace \
    :library:assembleRelease \
    "${TEST_TASKS[@]}"
)

ARTIFACT_DIR="${ROOTENCODER_ARTIFACT_DIR:-"$ROOTENCODER_DIR/../rootencoder-build-output"}"
mkdir -p "$ARTIFACT_DIR"

for module in "${MODULES[@]}"; do
  aar="$ROOTENCODER_DIR/$module/build/outputs/aar/$module-release.aar"
  if [[ ! -s "$aar" ]]; then
    echo "ERROR: expected release AAR missing or empty: $aar" >&2
    exit 1
  fi
  cp "$aar" "$ARTIFACT_DIR/$module-release.aar"
done

python3 - "$ARTIFACT_DIR/library-release.aar" "$ARTIFACT_DIR/rootencoder-build-report.txt" <<'PY'
import hashlib
import io
import pathlib
import subprocess
import sys
import tempfile
import zipfile

aar_path = pathlib.Path(sys.argv[1])
report_path = pathlib.Path(sys.argv[2])
with zipfile.ZipFile(aar_path) as aar:
    if "classes.jar" not in aar.namelist():
        raise SystemExit("ERROR: library AAR does not contain classes.jar")
    class_bytes = aar.read("classes.jar")

required = {
    "com/pedro/library/view/OutputFrameResult.class",
    "com/pedro/library/view/EncoderOutputTarget.class",
    "com/pedro/library/view/OutputFrameCallback.class",
    "com/pedro/library/view/GlStreamInterface.class",
}
with zipfile.ZipFile(io.BytesIO(class_bytes)) as jar:
    actual = set(jar.namelist())
missing = sorted(required - actual)
if missing:
    raise SystemExit("ERROR: patched callback classes missing from AAR: " + ", ".join(missing))

with tempfile.TemporaryDirectory(prefix="syntxrr-rootencoder-api-") as temp:
    classes_jar = pathlib.Path(temp) / "classes.jar"
    classes_jar.write_bytes(class_bytes)
    result = subprocess.run(
        ["javap", "-classpath", str(classes_jar), "-p", "com.pedro.library.view.GlStreamInterface"],
        check=True, text=True, capture_output=True,
    )
    if "setOutputFrameCallback" not in result.stdout:
        raise SystemExit("ERROR: compiled GlStreamInterface lacks setOutputFrameCallback API")

sha = hashlib.sha256(aar_path.read_bytes()).hexdigest()
size = aar_path.stat().st_size
report = [
    "SYNTXRR RootEncoder 2.8.1 patched-fork build report",
    f"library-release.aar size_bytes={size}",
    f"library-release.aar sha256={sha}",
    "callback_classes=4/4 present",
    "javap_setOutputFrameCallback=PASS",
    "scope=EGL submission acknowledgement only; no MediaCodec or RTMP delivery acknowledgement",
]
report_path.write_text("\n".join(report) + "\n", encoding="utf-8")
print("\n".join(report))
PY

printf '\nVerified AAR outputs:\n'
for module in "${MODULES[@]}"; do
  sha256sum "$ARTIFACT_DIR/$module-release.aar"
done
printf '\nBuild artifacts: %s\n' "$ARTIFACT_DIR"
