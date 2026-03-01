# Custom Roles & Agents

How to customize and extend Karajan Code with your own roles and agents.

## Role Customization via Markdown Files

Each role in Karajan is guided by a `.md` file that contains its instructions, priorities, and output format. You can override any built-in role by creating a custom `.md` file.

### How role files are resolved

Karajan looks for role instructions in this order (first found wins):

1. **Project-local**: `.karajan/roles/<role>.md`
2. **Global**: `~/.karajan/roles/<role>.md`
3. **Built-in template**: `templates/roles/<role>.md` (bundled with Karajan)

### Available roles

| Role | File | Purpose |
|------|------|---------|
| coder | `coder.md` | Code generation and modification |
| reviewer | `reviewer.md` | Code review and approval |
| planner | `planner.md` | Task decomposition and planning |
| researcher | `researcher.md` | Codebase analysis before coding |
| refactorer | `refactorer.md` | Code cleanup post-coding |
| tester | `tester.md` | Test quality evaluation |
| security | `security.md` | Security audit |
| commiter | `commiter.md` | Git commit message generation |
| solomon | `solomon.md` | Conflict resolution between roles |
| triage | `triage.md` | Task complexity classification |
| sonar | `sonar.md` | SonarQube analysis interpretation |

### Example: Custom reviewer role

Create `.karajan/roles/reviewer.md` in your project:

```markdown
# Custom Reviewer

You are a reviewer focused on our team's specific standards.

## Review priorities

1. **API contracts** — all endpoints must follow our OpenAPI spec
2. **Error handling** — use our custom AppError class, never throw raw strings
3. **Database** — all queries must use parameterized statements
4. **Logging** — every public method must log entry/exit at debug level

## Rules

- Only block for security issues and broken API contracts.
- Style issues are NEVER blocking.
- If tests cover the change, be lenient on implementation details.

## Output format

Return a strict JSON object:
\`\`\`json
{
  "ok": true,
  "result": {
    "approved": true|false,
    "blocking_issues": [],
    "suggestions": [],
    "confidence": 0.95
  },
  "summary": "Brief description of the review result"
}
\`\`\`
```

### Review mode profiles

Karajan includes built-in reviewer profiles for different strictness levels:

| Mode | File | Behavior |
|------|------|----------|
| standard | `reviewer.md` | Balanced (default) |
| paranoid | `reviewer-paranoid.md` | Very strict, blocks on anything questionable |
| strict | `reviewer-strict.md` | Strict but reasonable |
| relaxed | `reviewer-relaxed.md` | Only blocks on security/correctness issues |

Set the mode in `kj.config.yml`:
```yaml
review_mode: paranoid   # paranoid | strict | standard | relaxed | custom
```

Or per-run: `kj run --mode paranoid`

## Custom Agents

### Registering an external agent

If you have a custom AI CLI tool, you can register it as a Karajan agent. Create a file that extends `BaseAgent`:

```javascript
// my-custom-agent.js
import { BaseAgent } from "karajan-code/src/agents/base-agent.js";

export class MyCustomAgent extends BaseAgent {
  async runTask({ prompt, workDir, onOutput }) {
    // Execute your AI CLI tool
    const result = await this.exec("my-ai-tool", [
      "code",
      "--prompt", prompt,
      "--cwd", workDir
    ], { onOutput });

    return {
      ok: result.exitCode === 0,
      output: result.stdout,
      error: result.stderr,
      exitCode: result.exitCode
    };
  }

  async reviewTask({ prompt, workDir, onOutput }) {
    const result = await this.exec("my-ai-tool", [
      "review",
      "--prompt", prompt,
      "--cwd", workDir
    ], { onOutput });

    return {
      ok: result.exitCode === 0,
      output: result.stdout,
      error: result.stderr,
      exitCode: result.exitCode
    };
  }
}
```

Then register it before running Karajan:

```javascript
import { registerAgent } from "karajan-code/src/agents/index.js";
import { MyCustomAgent } from "./my-custom-agent.js";

registerAgent("my-ai", MyCustomAgent, {
  bin: "my-ai-tool",                          // CLI binary name
  installUrl: "https://my-ai-tool.dev/install" // Install instructions URL
});
```

### Agent interface contract

Every agent must implement these methods (from `BaseAgent`):

| Method | Input | Output | Purpose |
|--------|-------|--------|---------|
| `runTask({ prompt, workDir, onOutput })` | Task prompt + working directory | `{ ok, output, error, exitCode }` | Execute coding tasks |
| `reviewTask({ prompt, workDir, onOutput })` | Review prompt + working directory | `{ ok, output, error, exitCode }` | Review code changes |
| `getRoleModel(role)` | Role name (e.g., "coder") | Model string or null | Return model for a role |

The `onOutput` callback receives `{ stream: "stdout"|"stderr", line: "..." }` for real-time output streaming.

## Configuration

### Role providers in kj.config.yml

Assign specific agents to specific roles:

```yaml
# Default agents for main roles
coder: claude
reviewer: codex

# Per-role provider overrides
roles:
  coder:
    provider: claude
    model: claude-sonnet-4-20250514
  reviewer:
    provider: codex
    model: null           # Use agent's default
  planner:
    provider: claude
    model: claude-sonnet-4-20250514
  refactorer:
    provider: claude
  tester:
    provider: claude
  security:
    provider: claude

# Pipeline toggles
pipeline:
  triage:
    enabled: true         # Auto-classify task complexity
  researcher:
    enabled: true         # Analyze codebase before coding
  planner:
    enabled: true         # Decompose task into steps
  refactorer:
    enabled: false        # Cleanup pass after coding
  tester:
    enabled: true         # Evaluate test quality
  security:
    enabled: true         # Security audit
```

### CLI overrides

Override any role setting per-run:

```bash
kj run --coder codex --reviewer claude --task "Fix the login bug"
kj run --enable-tester false --enable-security false  # Skip post-loop stages
kj run --mode paranoid  # Use paranoid reviewer profile
```
