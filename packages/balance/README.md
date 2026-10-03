# @blockyrts/balance

The balance editor: a web page that shows every balance value the sim runs
on, lets you change any of them, and exports only what you changed as a JSON
file that `balance:apply` turns back into code.

```sh
pnpm balance:dev                          # http://localhost:5175
pnpm --filter @blockyrts/balance build    # dist/index.html, one self-contained file
pnpm --filter @blockyrts/tools balance:apply balance-changes-2026-10-02.json [--dry-run] [--force]
```

## Where the values come from

Nothing is copied by hand. At build time the page bundles every module of
`packages/sim/src` (`src/app/sim-data.ts` globs them) and walks whatever they
export, so a changed number or a new table shows up on the next build. The
words come from the code too: each module's header comment, the comment above
each export and the comments on interface fields (read at build time by the
`virtual:sim-docs` plugin in `vite.config.ts`).

`src/core/rules.ts` is the only hand-kept part: which group each module's
exports belong in, which exports are plumbing rather than balance (ids,
budgets, the state layout), which keys name a resource, mob, research or
building, readable labels, and units. A number it does not know still shows,
under "Other numbers", with a label made from its name.

Units: the sim holds integers (steps at 20 a second, basis points, world
units of 0.125 mm, tenths). The editor shows seconds, percent, metres, m/s,
lb and so on, and turns what you type back into the nearest integer the sim
can hold. `src/core/units.ts` has the scales.

## The export file

`balance-changes-YYYY-MM-DD.json`, schema 1 (`src/core/schema.ts`):

```json
{
  "kind": "blockyrts-balance-changes",
  "schema": 1,
  "commit": "<git commit the editor's tables came from>",
  "builtAt": "...", "exportedAt": "...",
  "changes": [
    {
      "module": "buildings/data.ts",
      "path": ["BUILDINGS", 0, "levels", 1, "ws"],
      "label": "Buildings and levels > Big House > Levels > Level 2: Longhall > Build work",
      "old": 400, "new": 450,
      "unit": "worker-seconds: ...", "oldDisplay": "400 ws", "newDisplay": "450 ws",
      "note": "optional"
    }
  ],
  "entryNotes": [{ "module": "...", "path": ["MOBS", 0], "label": "Mobs and nights > Zombie", "note": "free text" }],
  "notes": "free text"
}
```

`module` is the file under `packages/sim/src`; `path` is the export's name
then keys and indices down to the value; `old` and `new` are the sim's own
integers (or true and false). References (a resource, a mob, a research) are
ids, with the names in `oldDisplay` and `newDisplay`. Entry notes and general
notes are for asks a value cannot express ("add 10 stone to this cost"): a
person reads them.

## Applying a file

`pnpm --filter @blockyrts/tools balance:apply <file>` (a path relative to
where you run it):

1. Skips values the sim no longer has (missing), already has (already so),
   or holds at a different number than the file's `old` (moved; `--force`
   applies them anyway).
2. Finds where each value is written (`packages/tools/src/balance/locate.ts`)
   and edits that one spot: a literal; the literal inside a scale helper such
   as `ds(16)` or `45 * STEPS_PER_SECOND`; a named constant or enum member
   used for this row only (`[ST, 20]` becomes `[Res.Flint, 20]`); or, for a
   value a row takes from a shared default (`...base`), a key of its own.
3. Anything else needs a person and is listed with its file and line: a value
   written in a helper several rows share, in a shared list, or worked out by
   a formula. About 70% of the editable values can be applied automatically
   today; the test reports the share.
4. Re-reads the whole sim in a fresh process, checks every edited value now
   holds its new value (undoing any edit that did not), and lists other
   values that changed with it (derived numbers such as the cycle length).
5. Exits 1 if anything was left for a person. Run `pnpm check` after.

## Serving it with the game

The build is one file, `packages/balance/dist/index.html`, with relative
paths only, so it works from disk, as an Artifact, or under `/balance` on the
Pages site. The Deploy workflow (owned by the hosting thread) needs one line
after the client build and before the Pages upload of `packages/client/dist`:

```sh
pnpm --filter @blockyrts/balance build && mkdir -p packages/client/dist/balance && cp packages/balance/dist/index.html packages/client/dist/balance/index.html
```

It then answers at https://play.surviveandconquer.cc/balance/.

## Tests

`packages/balance/test` checks the tree against the real sim (every value's
path reads back its value, every building, research step, kit tier, recipe, mob,
animal and lair has an entry, units round-trip) and the export and import.
`packages/tools/test/balance-apply.test.ts` applies single changes to a copy
of the sim and checks the exact edits, then changes every editable value at
once, re-reads the copy in a fresh process to confirm each value reported
applied, and typechecks it.
