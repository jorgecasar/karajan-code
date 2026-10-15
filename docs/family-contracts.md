# Karajan family: published contracts

What each member of the family publishes, and where its contract is written. A session working on an instance (a team deployment, a client repo) reads this first: **what is published is the contract**, so it never needs to open or touch the source of another repo.

Versions as of 2026-10-15. The source of truth for a version is always `npm view <name> version`; this table only tells you where to look.

| Package | npm name | Published | What it publishes | Where the contract lives |
|---|---|---|---|---|
| Karajan Code | `karajan-code` and `@karajan-family/code` (same content, both names in lockstep) | 4.52.0 (4.53.0 on its way) | CLI `kj`, MCP server `karajan-mcp`, `kj-rag-mcp`, the method contract it writes into `CLAUDE.md` / `AGENTS.md` / `GEMINI.md`, the Sentinel harness and the policy workflow | [README](../README.md), [CHANGELOG](../CHANGELOG.md), [karajancode.com/docs](https://karajancode.com/docs/) |
| Core | `karajan-core` | 1.5.0 | Shared primitives used by kj and the family | [packages/core](../packages/core) |
| RAG | `karajan-rag` | 1.7.0 | CLI `karajan-rag` (`kj-rag`, `kjr`), `karajan.config.json`, `serve --http`, the public JS API, the Terraform module `deploy/gcp` (private Cloud Run) | [packages/rag/README.md](../packages/rag/README.md) (sections *Comandos*, *API pública*, *Estabilidad*), [packages/rag/deploy/gcp/README.md](../packages/rag/deploy/gcp/README.md) |
| Watch | `karajan-watch` | 0.8.0 | CLI `karajan-watch`, `karajan-watch.config.json` and `validateConfig`, the reusable workflows `ingest`, `impact` and `drift` | [packages/watch/docs/config.md](../packages/watch/docs/config.md), [ingest.md](../packages/watch/docs/ingest.md), [impact.md](../packages/watch/docs/impact.md), [drift.md](../packages/watch/docs/drift.md), [karajan-rag-contract.md](../packages/watch/docs/karajan-rag-contract.md) |
| Console | `@karajan-family/console` | 0.3.0 | CLI `karajan-console`, `console.config.json` and its adapters (Cloud Run, IAM, audit sink) | [packages/console/README.md](../packages/console/README.md) |
| Governance | `@karajan-family/governance` | 0.1.1 | The governance primitives shared by kj and the console | [packages/governance](../packages/governance) |
| HU Board | `@karajan/hu-board` | private | Ships inside `karajan-code` (`kj board start`); not a contract of its own | [packages/hu-board/README.md](../packages/hu-board/README.md) |
| AI Trash | `@karajan/ai-trash` | not published | `kj-trash` (snapshots before destructive commands); internal until published | [packages/ai-trash/README.md](../packages/ai-trash/README.md) |

## Rules for an instance session

- Pin the version you use (`npm i karajan-rag@1.7.0`, `uses: …@v0.8.0`) and read the contract of that version, not of `main`.
- Something the contract does not cover is a request upstream: a card in the Planning Game project of that package and an issue in this repo, never a patch in the instance.
- A config file (`karajan.config.json`, `karajan-watch.config.json`, `console.config.json`) is validated by the published package itself; validate with the same version you deploy.
