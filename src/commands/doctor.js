import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runCommand } from "../utils/process.js";
import { exists } from "../utils/fs.js";
import { getConfigPath } from "../config.js";
import { isSonarReachable } from "../sonar/manager.js";
import { resolveRoleMdPath, loadFirstExisting } from "../roles/base-role.js";
import { ensureGitRepo } from "../utils/git.js";
import { checkBinary, KNOWN_AGENTS } from "../utils/agent-detect.js";

function getPackageVersion() {
  const pkgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../package.json");
  return JSON.parse(readFileSync(pkgPath, "utf8")).version;
}

export async function runChecks({ config }) {
  const checks = [];

  // 0. Karajan version
  const version = getPackageVersion();
  checks.push({
    name: "karajan",
    label: "Karajan Code",
    ok: true,
    detail: `v${version}`,
    fix: null
  });

  // 1. Config file
  const configPath = getConfigPath();
  const configExists = await exists(configPath);
  checks.push({
    name: "config",
    label: "Config file",
    ok: configExists,
    detail: configExists ? configPath : "Not found",
    fix: configExists ? null : "Run 'kj init' to create the config file."
  });

  // 2. Git repository
  let gitOk = false;
  try {
    gitOk = await ensureGitRepo();
  } catch {
    gitOk = false;
  }
  checks.push({
    name: "git",
    label: "Git repository",
    ok: gitOk,
    detail: gitOk ? "Inside a git repository" : "Not a git repository",
    fix: gitOk ? null : "Run 'git init' or navigate to a git-managed project."
  });

  // 3. Docker
  const docker = await checkBinary("docker", "--version");
  checks.push({
    name: "docker",
    label: "Docker",
    ok: docker.ok,
    detail: docker.ok ? docker.version : "Not found",
    fix: docker.ok ? null : "Install Docker: https://docs.docker.com/get-docker/"
  });

  // 4. SonarQube reachability
  const sonarHost = config.sonarqube?.host || "http://localhost:9000";
  let sonarOk = false;
  if (config.sonarqube?.enabled !== false) {
    try {
      sonarOk = await isSonarReachable(sonarHost);
    } catch {
      sonarOk = false;
    }
  }
  checks.push({
    name: "sonarqube",
    label: "SonarQube",
    ok: sonarOk || config.sonarqube?.enabled === false,
    detail: config.sonarqube?.enabled === false
      ? "Disabled in config"
      : sonarOk
        ? `Reachable at ${sonarHost}`
        : `Not reachable at ${sonarHost}`,
    fix: sonarOk || config.sonarqube?.enabled === false
      ? null
      : "Run 'kj sonar start' or 'docker start karajan-sonarqube'. Use --no-sonar to skip."
  });

  // 5. Agent CLIs
  for (const agent of KNOWN_AGENTS) {
    const result = await checkBinary(agent.name);
    checks.push({
      name: `agent:${agent.name}`,
      label: `Agent: ${agent.name}`,
      ok: result.ok,
      detail: result.ok ? `${result.version} (${result.path})` : "Not found",
      fix: result.ok ? null : `Install: ${agent.install}`
    });
  }

  // 6. Core binaries
  for (const bin of ["node", "npm", "git"]) {
    const result = await checkBinary(bin);
    checks.push({
      name: bin,
      label: bin,
      ok: result.ok,
      detail: result.ok ? result.version : "Not found",
      fix: result.ok ? null : `Install ${bin} from its official website.`
    });
  }

  // 7. Serena MCP
  if (config.serena?.enabled) {
    let serenaOk = false;
    try {
      const serenaCheck = await runCommand("serena", ["--version"]);
      serenaOk = serenaCheck.exitCode === 0;
    } catch {
      serenaOk = false;
    }
    checks.push({
      name: "serena",
      label: "Serena MCP",
      ok: serenaOk,
      detail: serenaOk ? "Available" : "Not found (prompts will still include Serena instructions)",
      fix: serenaOk ? null : "Install Serena: uvx --from git+https://github.com/oraios/serena serena --help"
    });
  }

  // 8. BecarIA Gateway infrastructure
  if (config.becaria?.enabled) {
    const projectDir = config.projectDir || process.cwd();

    // Workflow files
    const workflowDir = path.join(projectDir, ".github", "workflows");
    const requiredWorkflows = ["becaria-gateway.yml", "automerge.yml", "houston-override.yml"];
    for (const wf of requiredWorkflows) {
      const wfPath = path.join(workflowDir, wf);
      const wfExists = await exists(wfPath);
      checks.push({
        name: `becaria:workflow:${wf}`,
        label: `BecarIA workflow: ${wf}`,
        ok: wfExists,
        detail: wfExists ? "Found" : "Not found",
        fix: wfExists ? null : `Run 'kj init --scaffold-becaria' or copy from karajan-code/templates/workflows/${wf}`
      });
    }

    // gh CLI
    const ghCheck = await checkBinary("gh");
    checks.push({
      name: "becaria:gh",
      label: "BecarIA: gh CLI",
      ok: ghCheck.ok,
      detail: ghCheck.ok ? ghCheck.version : "Not found",
      fix: ghCheck.ok ? null : "Install GitHub CLI: https://cli.github.com/"
    });

    // Secrets check via gh api (best effort — only works if user has admin access)
    let secretsOk = false;
    try {
      const { detectRepo } = await import("../becaria/repo.js");
      const repo = await detectRepo();
      if (repo) {
        const secretsRes = await runCommand("gh", ["api", `repos/${repo}/actions/secrets`, "--jq", ".secrets[].name"]);
        if (secretsRes.exitCode === 0) {
          const names = secretsRes.stdout.split("\n").map((s) => s.trim());
          const hasAppId = names.includes("BECARIA_APP_ID");
          const hasKey = names.includes("BECARIA_APP_PRIVATE_KEY");
          secretsOk = hasAppId && hasKey;
          checks.push({
            name: "becaria:secrets",
            label: "BecarIA: GitHub secrets",
            ok: secretsOk,
            detail: secretsOk ? "BECARIA_APP_ID + BECARIA_APP_PRIVATE_KEY found" : `Missing: ${!hasAppId ? "BECARIA_APP_ID " : ""}${!hasKey ? "BECARIA_APP_PRIVATE_KEY" : ""}`.trim(),
            fix: secretsOk ? null : "Add BECARIA_APP_ID and BECARIA_APP_PRIVATE_KEY as GitHub repository secrets"
          });
        }
      }
    } catch {
      // Skip secrets check if we can't access the API
    }
  }

  // 9. Review rules / Coder rules
  const projectDir = config.projectDir || process.cwd();
  const reviewRules = await loadFirstExisting(resolveRoleMdPath("reviewer", projectDir));
  const coderRules = await loadFirstExisting(resolveRoleMdPath("coder", projectDir));
  checks.push({
    name: "review-rules",
    label: "Reviewer rules (.md)",
    ok: Boolean(reviewRules),
    detail: reviewRules ? "Found" : "Not found (will use defaults)",
    fix: null
  });
  checks.push({
    name: "coder-rules",
    label: "Coder rules (.md)",
    ok: Boolean(coderRules),
    detail: coderRules ? "Found" : "Not found (will use defaults)",
    fix: null
  });

  return checks;
}

export async function doctorCommand({ config }) {
  const checks = await runChecks({ config });

  for (const check of checks) {
    const icon = check.ok ? "OK  " : "MISS";
    console.log(`${icon} ${check.label}: ${check.detail}`);
    if (check.fix) {
      console.log(`     -> ${check.fix}`);
    }
  }

  const failures = checks.filter((c) => !c.ok && c.fix);
  if (failures.length === 0) {
    console.log("\nAll checks passed.");
  } else {
    console.log(`\n${failures.length} issue(s) found.`);
  }

  return checks;
}
