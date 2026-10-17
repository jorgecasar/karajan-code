# Developing kj while kj governs your other sessions

Karajan is developed with Karajan: the `kj` on the maintainer's machine also governs every other project (hooks, Sentinel, reviews). If that `kj` ran straight from the working tree being edited, any half-made edit would reach every session as a field bug (KJC-BUG-0371 / #2230: a refactor in progress broke `kj review --range` in another project for a few minutes).

So the machine's `kj` comes from a **stable clone that only follows `main`** (KJC-TSK-1080):

| Tree | What it is | Who changes it |
|------|------------|----------------|
| `~/ws_npm-packages/karajan-code` | development tree, branches and PRs | the Karajan session |
| `~/ws_npm-packages/karajan-code-stable` | clone on `origin/main`, target of `npm link` | only the sync job |

- A cron job runs `~/.karajan/sync-stable-kj.sh` every 3 minutes: `git fetch` + fast-forward to `origin/main`, and `npm ci` only when `package-lock.json` changed. A merge reaches every session within minutes, without publishing; unmerged work never does.
- To try unmerged code, run the development tree's CLI directly: `node bin/kj.js <command>`.
- The development session never touches the stable clone (it is another repository for the repo-boundary rule).
- To set it up on a new machine: clone into `karajan-code-stable`, `npm ci`, `npm link` from there, and install the cron line that calls the sync script.
