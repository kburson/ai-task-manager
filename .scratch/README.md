# Disposable Scratch

Everything under `.scratch/` except this file is disposable, one-off working material. Nothing in this repository depends on a scratch file being present.

Use `.scratch/` for issue-body drafts, deep-dive working copies, ad hoc inspection output, and other work that can be deleted without recovery. Machine-local runtime state and generated output belong under `.tmp/` instead.

If an ad hoc helper proves reusable, graduate it to tracked `scripts/maintenance/` code with tests and documentation. Location is the ownership signal: `.scratch/` means “not required”; `scripts/` means “maintained and required.”
