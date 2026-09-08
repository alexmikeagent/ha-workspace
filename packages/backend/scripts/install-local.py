"""Install the pinned, checksum-verified native backend without changing other services."""
import hashlib
import io
import json
import os
from pathlib import Path
import urllib.request
import zipfile

RELEASE = "precompiled-2026-08-25-7cce8fb"
URL = f"https://github.com/get-convex/convex-backend/releases/download/{RELEASE}/convex-local-backend-x86_64-unknown-linux-gnu.zip"
DIGEST = "470250263fcf6c71b931219550c3705d9ab03d79c3b1e1e8364465c2b44eff9f"
root = Path(os.environ["WORKSPACE_DATA_ROOT"]).resolve(strict=True)
if "googledrive" in (part.lower() for part in root.parts):
    raise RuntimeError("Backend storage must be outside the source Drive.")
if os.uname().machine != "x86_64":
    raise RuntimeError("This pinned native build is for Linux x86_64.")
with urllib.request.urlopen(URL, timeout=60) as response:
    archive_bytes = response.read()
if hashlib.sha256(archive_bytes).hexdigest() != DIGEST:
    raise RuntimeError("The official archive checksum did not match.")
with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
    if archive.namelist() != ["convex-local-backend"]:
        raise RuntimeError("Unexpected archive layout.")
    binary = archive.read("convex-local-backend")
directory = root / "convex" / "bin"
directory.mkdir(parents=True, exist_ok=True, mode=0o700)
target = directory / "convex-local-backend"
if target.exists():
    if target.is_symlink() or target.read_bytes() != binary:
        raise RuntimeError("An existing backend differs; review upgrades before replacing it.")
else:
    with target.open("xb") as handle:
        handle.write(binary)
    target.chmod(0o700)
metadata = {"release": RELEASE, "url": URL, "archiveSha256": DIGEST, "binarySha256": hashlib.sha256(binary).hexdigest()}
(root / "convex" / "version.json").write_text(json.dumps(metadata, indent=2) + "\n")
print("Pinned native backend verified and ready. Other local Convex services were not changed.")
