# Issue tracker conventions

## Issues and specifications

Use GitHub Issues for tracked work and `gh` for issue operations. Run it inside this repository so it resolves the configured remote.

- When a workflow asks to publish to the issue tracker, create a GitHub issue. When it asks to fetch a ticket, read the issue and its comments.
- Keep repository specifications in `docs/specs/` and implementation plans in `docs/plans/`; link relevant documents from tracked work.
- For multiline issue or comment bodies, write the text to a temporary file and pass `--body-file` to preserve formatting.
- A bare GitHub number may identify an issue or a pull request; check its type before applying a workflow.

**PRs as a request surface: no.** Feature-request triage applies to issues.

## Triage labels

Use these exact label names when a workflow refers to the corresponding role:

| Label | Meaning |
| --- | --- |
| `needs-triage` | Maintainer needs to evaluate the issue. |
| `needs-info` | Waiting for information from the reporter. |
| `ready-for-agent` | Fully specified and ready for autonomous implementation. |
| `ready-for-human` | Requires human implementation. |
| `wontfix` | Will not be actioned. |

## Wayfinding workflow

Apply this section when running a wayfinding workflow with a map issue and child tasks.

- Label the map `wayfinder:map`; its body holds Notes, Decisions-so-far, and Fog.
- Link child tasks as GitHub sub-issues and label them `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`. If sub-issues are unavailable, use a task list on the map and a `Part of #<map>` reference on each child.
- Represent blockers with GitHub issue dependencies. Dependency API operations use the issue's database ID, not its issue number or node ID. If dependencies are unavailable, record `Blocked by: #<number>` references in the child body.
- Select the first open, unassigned child in map order whose blockers are all closed. Claim it by assigning the current GitHub user before starting the task.
- On resolution, comment with the result, close the child, and add a brief result and link to the map's Decisions-so-far.
