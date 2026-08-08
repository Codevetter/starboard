---
target: Projects shared app shell
total_score: 32
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 0
timestamp: 2026-08-08T20-34-51Z
slug: src-components-projects-workspace-tsx
---
Method: dual-agent (A: design_assessment · B: detector_assessment)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of system status | 4 | Loading, empty, active-route, and destructive states are explicit. |
| 2 | Match system / real world | 3 | A few evidence terms still assume a technical audience. |
| 3 | User control and freedom | 3 | Navigation and disconnect recovery are clear. |
| 4 | Consistency and standards | 4 | Projects and Library literally share AppShell and TopBar. |
| 5 | Error prevention | 3 | Picker and disconnect guard common mistakes. |
| 6 | Recognition rather than recall | 4 | Routes, current project, and recommendation evidence remain visible. |
| 7 | Flexibility and efficiency | 3 | Paste and searchable picker paths cover novice and expert use. |
| 8 | Aesthetic and minimalist design | 3 | Clear hierarchy; sparse one-result rows can still feel under-filled. |
| 9 | Error recovery | 3 | Plain-language recovery exists for the primary failure paths. |
| 10 | Help and documentation | 2 | Match and confidence concepts rely mainly on inline copy. |
| **Total** |  | **32/40** | **Good** |

## Design Specificity Verdict

The Projects surface now uses Starboard's incumbent product structure rather than imitating it. Both authenticated routes share `AppShell`; Projects renders the same `TopBar`, navigation data, active-route state, account menu, spacing, and viewport behavior. The detector returned zero findings across the changed shell files.

## Overall Impression

The structural regression is resolved. Projects feels like a route within Starboard at mobile, tablet, and desktop sizes. The single biggest improvement was deleting the local Projects navbar and placing project-specific content inside the established app shell.

## What's Working

- One shared navigation definition renders both desktop links and the mobile menu.
- The project form, connected-project list, and recommendations stack cleanly at 390px and retain a stable sidebar at 768px and 1440px.
- Mobile navigation is labeled, keyboard-backed by the shared dropdown component, and uses 44px triggers.

## Priority Issues

- No P0 or P1 issues remain.
- **[P2] Sparse recommendation rows at 1440px:** a single peer occupies one narrow track in a three-column grid. This is functional but visually under-filled; an auto-fit result grid would improve rare one-result states.

## Persona Red Flags

- **Alex:** no shell inconsistency remains; project switching and the picker are directly available.
- **Sam:** shared controls have labels and visible focus behavior; mobile menu and avatar targets meet 44px.
- **Casey:** navigation is available from a compact menu and the feedback trigger is reduced to a non-obstructive icon.

## Minor Observations

- The compact feedback trigger is intentionally icon-only on mobile but retains the widget's accessible control name.
- The Next.js development indicator visible in screenshots is not product UI.

## Questions to Consider

- Should rare one-peer states use a wider editorial card, or should all peer cards retain a stable scan width?
