# Historical static inputs

These base64 files preserve the exact static bytes referenced by the archived pre-slim guidance captures. Each decoded file must match the SHA-256 and source path in `manifest.json`. The skill snapshot is from implementation checkpoint `f82a6cd96` (before the #1859 guidance edit); the other snapshots match the unchanged fixture files. Their digests also match the archived capture and comparison identities.

Historical replay uses these bytes instead of silently substituting current guidance. Current final release validation still reads the live source files and requires the freshly captured identities. The obsolete #1767 recertification remains archived evidence and cannot assert current GO.
