# Selfmology ERP — Change Management Method

Every update, feature and fix lands in the tracker spreadsheet through one
repeatable path. This document is the definition of that path.

**Tracker spreadsheet:** https://docs.google.com/spreadsheets/d/19kh_WNoZrEKGxxAjFFn1cktS4no2gj0wFIFredSKzYY/edit

---

## 1. Why four registers, not one

The sheet already had two of the four registers it needs. The gap was the
middle one — nothing recorded *what actually shipped*.

| Register | Answers | Grain | Tab |
| --- | --- | --- | --- |
| **Ticket Log** | *Why* are we doing this? | one request | `Request Tracker` |
| **Change Log** | *What* shipped, and can we undo it? | one commit | `Change Log` |
| **Release Log** | *Which* version did the user receive? | one version | `Release Log` |
| **What's Next** | *What should we do now?* | one action | `What's Next` |

Note the ticket tab is named **`Request Tracker`**, not "Ticket Log".

The first three are a historical record. **What's Next** is the only forward-looking
one: a short, ranked list of what to do next, rewritten each time work ships rather
than appended to. Keep it under ~10 rows — if everything is on it, nothing is next.
Anything that grows a life of its own becomes a ticket and drops off this list.

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

One row in **Request Tracker**. Fill the input columns; write the *formula* into
`Priority Score`, `Priority Level` and `Resolution Time (Days)` for that row —
never a literal number. The formulas are:

```
M  Priority Score     =H{r}*3+I{r}*2+J{r}*2+K{r}*3-L{r}
N  Priority Level     =IFS(M{r}>=40,"Critical",M{r}>=30,"High",M{r}>=20,"Medium",M{r}>=10,"Low",M{r}<10,"Future")
U  Resolution Time    =IF(T{r}<>"",T{r}-B{r},"")
```

So Priority Score weights **Impact ×3, Urgency ×2, Frequency ×2, Severity ×3,
minus Complexity** — severity and business impact dominate, and a complex fix is
nudged down rather than penalised heavily.

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

### Step 4 — Write to the sheet

The rows go into the spreadsheet directly via the authorized Google Sheets
connection. No copy-paste step. The TSVs under `docs/sheet-exports/` are staging
output — useful for review and diffing, but they are not the delivery mechanism.

> **Never write literal values into `Priority Score`, `Priority Level`, or
> `Resolution Time (Days)`.** Those cells hold formulas; write the formula for the
> target row instead, so the column keeps working when inputs change.

---

### Step 5 — Cut a release

When a batch of changes goes live, add one **Release Log** row and bump the
version. Roll up the Change Log entries into the Keep-a-Changelog sections, and
rewrite **What's Next** to reflect the new state.

---

## 3. Change Log tab — column definition

The **Change Log** tab (created 2026-08-17) has this header row:

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

## 3b. What's Next tab — column definition

| Column | Notes |
| --- | --- |
| `Priority` | 1 = do first. Renumber freely; this list is rewritten, not appended to. |
| `Action` | One concrete next step, phrased as something a person can start. |
| `Why it matters` | The consequence of *not* doing it. If this is hard to write, the row probably does not belong. |
| `Owner` | Who moves it. |
| `Blocked By` | The specific missing input, not "waiting". |
| `Target` | When, or the event that should trigger it. |
| `Status` | Open / Blocked - waiting for input / Backlog / Done |

Replace the whole tab's contents each time work ships. Rows that survive several
rewrites without moving are a signal: either promote them to a ticket or drop them.

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
3. **Write the rows into the spreadsheet directly.** Do not hand over files to
   paste — that was explicitly rejected. A Google Sheets connection is authorized
   as `cristocl13@gmail.com`.
4. Rewrite the **What's Next** tab to match the new state, rather than appending.
5. Raise a ticket row for any *new* problem found along the way, rather than
   fixing it silently.
6. Read the affected ranges back afterwards and confirm the formula columns
   computed. A write that reports `200 OK` has not been verified.

### Writing efficiently

Use the Sheets REST API through the connection's raw-request action —
`values:batchUpdate` with `valueInputOption: USER_ENTERED` — rather than
row-by-row actions. Two calls cover a 33-row table; row-by-row would take 33.

Generate the JSON body from the TSV with a script. Transcribing 15-column rows by
hand into a tool call is how a wrong commit SHA or a dropped column gets in.
