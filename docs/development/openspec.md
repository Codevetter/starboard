# Spec-driven workflow

Non-trivial Starboard features are planned in one GitHub tracking issue before
implementation. The issue body contains the proposal, design notes,
requirements and scenarios, and the task checklist; there is no repo-local
spec directory or CLI.

Use the Fleet `spec-driven` skill for a new surface, route, capability,
multi-file behavior change, or cross-repository feature. Skip it for bug fixes,
cleanup, dependency updates, copy edits, tests for existing behavior, and
configuration or CI tweaks.

Track implementation and remaining work in
[Starboard GitHub Issues](https://github.com/Codevetter/starboard/issues).
Durable shipped product truth belongs in `PROJECT_STATUS.md`.
