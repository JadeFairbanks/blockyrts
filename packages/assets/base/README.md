# Base bodies

The project's own base models, made by the project's model thread (not by the
outside modelling bot): `models/peoples/worker`, `warrior` and `mage`, each a
`.bbmodel` with its texture as `<id>.png`. They sit outside `src/` so the
modelling bot's asset pull requests never touch them, and they need no
`MANIFEST.md` row.

The model converter (`pnpm --filter @blockyrts/tools models:build`) reads both
`base/models/` and `src/models/` and checks the same rules for both.
