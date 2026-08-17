# Selfmology ERP — Change Management Method

Every update, feature and fix lands in the tracker spreadsheet through one
repeatable path. This document is the definition of that path.

**Tracker spreadsheet:** https://docs.google.com/spreadsheets/d/19kh_WNoZrEKGxxAjFFn1cktS4no2gj0wFIFredSKzYY/edit

---

## 1. Why three registers, not one

The sheet already had two of the three registers it needs. The gap was the
middle one — nothing recorded *what actually shipped*.

| Register | Answers | Grain | Tab |
| --- | --- | --- | --- |
| **Ticket Log** | *Why* are we doing this? | one request | existing |
| **Change Log** | *What* shipped, and can we undo it? | one commit | **new — add this tab** |
| **Release Log** | *Which* version did the user receive? | one version | existing (was empty) |

A ticket can produce several changes. Several changes bundle into one release.
Keeping them separate is what lets you answer "the Aug 10 dashboard numbers look
wrong — what changed and how do I roll it back?" without reading git history.

The model borrows deliberately from four established sources, so nothing here is
invented from scratch:

- **Conventional Commits** — the `type(scope):` prefix already used in this
  repo's commit messages. It is what makes the Change Log generatable rather
  than hand-typed.
- **Semantic Versioning** — `MAJOR.MINOR.PATCH` for the Release Log.
- **Keep a Changelog** — the *Added / Changed / Fixed / Removed* vocabulary for
  release notes.
- **ITIL change record** — the three fields that make a log operationally
  useful rather than decorative: **Risk**, **Verification**, **Rollback**.

---

## 2. The loop

```
  request                                    ship
     │                                        │
     ▼                                        ▼
┌──────────┐   pick up    ┌──────────┐   commit    ┌────────────┐   cut     ┌─────────────┐
│  Ticket  │ ───────────▶ │  Branch  │ ──────────▶ │ Change Log │ ────────▶ │ Release Log │
│   Log    │              │   work   │             │   (auto)   │           │   (manual)  │
└──────────┘              └──────────┘             └────────────┘           └─────────────┘
     ▲                                                    │
     └──────────────── status → Done ────────────────────┘
```

### Step 1 — Raise a ticket (before work starts)

One row in **Ticket Log**. Fill only the input columns; leave
`Priority Score`, `Priority Level` and `Resolution Time (Days)` to the sheet's
own formulas.

Ticket IDs are sequential: `TK-001`, `TK-002`, …

### Step 2 — Commit with a conventional message

```
<type>(<scope>): <summary>          [TK-00N]
```

`type` is one of:

| type | meaning | Release Log section |
| --- | --- | --- |
| `feat` | new capability | Features Delivered |
| `fix` | defect repair | Bugs Fixed |
| `data` | master data / reference data change | Features Delivered |
| `refactor` | internal restructure, no behaviour change | — |
| `style` | UI/presentation only | Features Delivered |
| `perf` | performance | Features Delivered |
| `docs` | documentation | — |
| `chore` | tooling, build, deps | — |

`scope` is the **Module**, matching the sheet's Modules list:
`dashboard`, `inventory`, `delivery`, `expenses`, `crm`, `purchasing`,
`manufacturing`, `reports`, `settings`, `users`.

Put the ticket ID in the commit body or subject so the Change Log can link them.
A change with no ticket is allowed (write `—`), but it should be rare.

### Step 3 — Generate the Change Log rows

```sh
node scripts/gen-sheet-rows.mjs
```

Writes paste-ready TSV into `docs/sheet-exports/`. The script parses git history
and infers `Type`, `Module`, `Version` and `Ticket ID`. Anything it cannot infer
— **Risk**, **Verification**, **Rollback** — comes from
`docs/change-log-overrides.json`, which you edit once per meaningful change.

### Step 4 — Paste into the sheet

Open the tab, click the first empty cell of column A, paste. TSV pastes into
columns without needing an import dialog.

> **Do not paste into `Priority Score`, `Priority Level`, or
> `Resolution Time (Days)`.** Those hold sheet formulas; pasted values overwrite
> them. The generated ticket rows leave those columns empty for that reason.

### Step 5 — Cut a release

When a batch of changes goes live, add one **Release Log** row and bump the
version. Roll up the Change Log entries into the Keep-a-Changelog sections.

---

## 3. Change Log tab — column definition

Add a tab named **Change Log** with this header row:

| # | Column | Source | Notes |
| --- | --- | --- | --- |
| A | `Change ID` | auto | `CH-0001`, sequential |
| B | `Date` | git author date | `YYYY-MM-DD` |
| C | `Version` | manual/override | the release this belongs to |
| D | `Type` | commit prefix | feat / fix / data / … |
| E | `Module` | commit scope | matches the Modules list |
| F | `Summary` | commit subject | one line, imperative |
| G | `Detail` | override | what changed and why it was safe |
| H | `Ticket ID` | commit body | `TK-00N` or `—` |
| I | `Commit` | git | short SHA — the audit anchor |
| J | `Files Changed` | git | count |
| K | `Author` | git | |
| L | `Risk` | override | Low / Medium / High |
| M | `Verification` | override | how it was proven correct |
| N | `Rollback` | override | how to undo it |
| O | `Status` | manual | Shipped / Reverted / Superseded |

Columns G, L, M and N are the ones worth the typing. The rest is generated.

### Risk rating

| Risk | Criterion |
| --- | --- |
| **High** | Touches stock quantities, money, or historical records that are re-processed (any change to the CSV import path is High by default) |
| **Medium** | Changes a calculation shown to the user, but is recomputed from source on every load |
| **Low** | UI, copy, layout, docs, tooling |

---

## 4. Release Log tab — how to fill it

| Column | Rule |
| --- | --- |
| `Version` | SemVer. **MAJOR** = data model breaks. **MINOR** = new capability. **PATCH** = fix only. |
| `Release Date` | `YYYY-MM-DD` the change reached production |
| `Features Delivered` | `feat`/`data`/`style`/`perf` summaries, `;`-separated |
| `Bugs Fixed` | `fix` summaries, with ticket IDs |
| `Known Issues` | anything shipped with a caveat — **never leave this blank when a caveat exists** |
| `Owner` | who cut the release |
| `Notes` | migration/backfill steps a future reader would need |

---

## 5. Standing rule for the assistant

Whenever a feature, fix or data change is made to this project:

1. Update `docs/change-log-overrides.json` with Detail / Risk / Verification / Rollback.
2. Run `node scripts/gen-sheet-rows.mjs`.
3. Hand over the regenerated TSVs from `docs/sheet-exports/` with a note on
   which tab each one belongs to, and which rows are new since last time.
4. Raise a ticket row for any *new* problem found along the way, rather than
   fixing it silently.

If a Google Sheets connection is ever authorized, steps 3–4 can write to the
spreadsheet directly instead of producing paste files.
