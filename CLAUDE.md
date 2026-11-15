# CLAUDE.md

La base de connaissance du projet est dans `docs/` : lire `docs/AGENTS.md` (règles, non négociables) et `docs/README.md` avant toute modification. La consigne du TP et ce qu’il reste à couvrir sont dans `docs/TP.md`.
`docs/IA-POSTURE.md` décrit comment l'IA est utilisée sur ce dépôt et ce qu'on attend de son code : relu, compris, testé.

Skills du projet (`.claude/skills/`) :
- `scaffold-api-route` : nouvelle route API + service + test, selon les conventions.
- `add-agent-tool` : nouvel outil pour un spécialiste de l'agent.
- `review` : checklist de revue (utilisée aussi par la revue IA en CI).

Avant de rendre la main : `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage` passent. Commits en Conventional Commits, en anglais.
