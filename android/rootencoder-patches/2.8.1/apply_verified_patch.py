#!/usr/bin/env python3
"""Verify and optionally apply SYNTXRR's RootEncoder 2.8.1 EGL patch.

This helper is intentionally fail-closed. It only accepts the exact upstream
2.8.1 commit and a clean checkout whose four modified source files match the
blob IDs audited by SYNTXRR. It never downloads code or changes Git remotes.

Usage:
  python3 apply_verified_patch.py /path/to/RootEncoder
  python3 apply_verified_patch.py /path/to/RootEncoder --apply
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

UPSTREAM_COMMIT = "cca548ab7942ab50d34dede272d5da90d46c6b67"
PATCH_NAME = "OUTPUT_FRAME_ACKNOWLEDGEMENT.patch"

EXPECTED_BASE_BLOBS = {
    "encoder/src/main/java/com/pedro/encoder/input/gl/SurfaceManager.java":
        "205196d5b4f44d5170aa06371871611192e5b7a0",
    "encoder/src/main/java/com/pedro/encoder/utils/gl/GlUtil.java":
        "9278d4d754434a3786c41426e7d793a7f8b45ef3",
    "encoder/src/main/java/com/pedro/encoder/input/gl/render/ScreenRender.java":
        "f32516b6fbfc74cb3ef801992847d71a328d8b4c",
    "library/src/main/java/com/pedro/library/view/GlStreamInterface.kt":
        "fd318e227032683229600203711827309f0d2514",
}

EXPECTED_PATCH_PATHS = set(EXPECTED_BASE_BLOBS) | {
    "library/src/main/java/com/pedro/library/view/OutputFrameResult.kt"
}


def run_git(root: Path, *args: str, check: bool = True) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=root,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if check and result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip()
        raise RuntimeError(f"git {' '.join(args)} failed: {detail}")
    return result.stdout.rstrip("\r\n")


def parse_porcelain_paths(output: str) -> set[str]:
    paths: set[str] = set()
    for line in output.splitlines():
        if len(line) < 4:
            continue
        path = line[3:]
        # Rename records can include "old -> new"; neither is expected here.
        if " -> " in path:
            old, new = path.split(" -> ", 1)
            paths.update((old, new))
        else:
            paths.add(path)
    return paths


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("rootencoder_checkout", type=Path,
                        help="path to a clean RootEncoder 2.8.1 Git checkout")
    parser.add_argument("--apply", action="store_true",
                        help="apply the patch after all checks pass (default: check only)")
    args = parser.parse_args()

    root = args.rootencoder_checkout.expanduser().resolve()
    if not root.exists() or not root.is_dir():
        print(f"ERROR: checkout directory does not exist: {root}", file=sys.stderr)
        return 2

    script_dir = Path(__file__).resolve().parent
    patch = script_dir / PATCH_NAME
    if not patch.is_file():
        print(f"ERROR: patch file not found: {patch}", file=sys.stderr)
        return 2

    try:
        top = Path(run_git(root, "rev-parse", "--show-toplevel")).resolve()
        if top != root:
            raise RuntimeError(f"provided path must be the Git root: {top}")

        head = run_git(root, "rev-parse", "HEAD")
        if head != UPSTREAM_COMMIT:
            raise RuntimeError(
                "wrong RootEncoder revision; expected exact upstream 2.8.1 "
                f"commit {UPSTREAM_COMMIT}, found {head}"
            )

        dirty = run_git(root, "status", "--porcelain", "--untracked-files=all")
        if dirty:
            raise RuntimeError(
                "checkout is not clean; commit or discard existing changes before applying\n"
                + dirty
            )

        print(f"[OK] RootEncoder HEAD: {head}")
        for relative_path, expected_blob in EXPECTED_BASE_BLOBS.items():
            actual_blob = run_git(root, "rev-parse", f"HEAD:{relative_path}")
            if actual_blob != expected_blob:
                raise RuntimeError(
                    f"source blob mismatch for {relative_path}: "
                    f"expected {expected_blob}, found {actual_blob}"
                )
            print(f"[OK] {relative_path} ({actual_blob})")

        new_file = root / "library/src/main/java/com/pedro/library/view/OutputFrameResult.kt"
        if new_file.exists():
            raise RuntimeError(f"patch destination already exists: {new_file}")

        run_git(root, "apply", "--check", str(patch))
        print("[OK] git apply --check")

        if not args.apply:
            print("CHECK ONLY: no files changed. Re-run with --apply to apply the patch.")
            return 0

        run_git(root, "apply", str(patch))
        changed = parse_porcelain_paths(
            run_git(root, "status", "--porcelain", "--untracked-files=all")
        )
        if changed != EXPECTED_PATCH_PATHS:
            raise RuntimeError(
                "post-apply changed-path set differs from the reviewed patch; "
                f"expected {sorted(EXPECTED_PATCH_PATHS)}, found {sorted(changed)}"
            )

        result_source = new_file.read_text(encoding="utf-8")
        interface_source = (root / "library/src/main/java/com/pedro/library/view/GlStreamInterface.kt").read_text(encoding="utf-8")
        required_markers = (
            "data class OutputFrameResult(",
            "fun interface OutputFrameCallback",
            "val eglSubmissionSucceeded: Boolean",
        )
        for marker in required_markers:
            if marker not in result_source:
                raise RuntimeError(f"post-apply result API missing marker: {marker}")
        if "fun setOutputFrameCallback(callback: OutputFrameCallback?)" not in interface_source:
            raise RuntimeError("post-apply GL interface callback API is missing")

        print("[OK] patch applied; exactly five reviewed paths changed")
        print("IMPORTANT: build and test the RootEncoder fork before publishing or consuming it.")
        return 0

    except (RuntimeError, OSError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
