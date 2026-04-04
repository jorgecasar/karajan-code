import * as v from "valibot";

const RoleSchema = v.object({
  provider: v.optional(v.nullable(v.string()), null),
  model: v.optional(v.nullable(v.string()), null),
});

const RoleOptional = (defaultVal = { provider: null, model: null }) => v.optional(RoleSchema, defaultVal);

const PipelineEntrySchema = (defaultEnabled = false) =>
  v.optional(
    v.object({
      enabled: v.optional(v.boolean(), defaultEnabled),
    }),
    { enabled: defaultEnabled }
  );

export const ConfigSchema = v.object({
  coder: v.optional(v.string(), "claude"),
  reviewer: v.optional(v.string(), "codex"),
  roles: v.optional(
    v.object({
      planner: RoleOptional(),
      coder: RoleOptional(),
      reviewer: RoleOptional(),
      refactorer: RoleOptional(),
      solomon: RoleOptional(),
      researcher: RoleOptional(),
      tester: RoleOptional(),
      security: RoleOptional(),
      impeccable: RoleOptional(),
      triage: RoleOptional(),
      discover: RoleOptional(),
      architect: RoleOptional(),
      hu_reviewer: RoleOptional(),
    }),
    {
      planner: { provider: null, model: null },
      coder: { provider: null, model: null },
      reviewer: { provider: null, model: null },
      refactorer: { provider: null, model: null },
      solomon: { provider: null, model: null },
      researcher: { provider: null, model: null },
      tester: { provider: null, model: null },
      security: { provider: null, model: null },
      impeccable: { provider: null, model: null },
      triage: { provider: null, model: null },
      discover: { provider: null, model: null },
      architect: { provider: null, model: null },
      hu_reviewer: { provider: null, model: null },
    }
  ),
  pipeline: v.optional(
    v.object({
      planner: PipelineEntrySchema(false),
      refactorer: PipelineEntrySchema(false),
      solomon: PipelineEntrySchema(true),
      researcher: PipelineEntrySchema(false),
      tester: PipelineEntrySchema(true),
      security: PipelineEntrySchema(true),
      impeccable: PipelineEntrySchema(false),
      triage: PipelineEntrySchema(true),
      discover: PipelineEntrySchema(false),
      architect: PipelineEntrySchema(false),
      hu_reviewer: PipelineEntrySchema(false),
      auto_simplify: v.optional(v.boolean(), true),
    }),
    {
      planner: { enabled: false },
      refactorer: { enabled: false },
      solomon: { enabled: true },
      researcher: { enabled: false },
      tester: { enabled: true },
      security: { enabled: true },
      impeccable: { enabled: false },
      triage: { enabled: true },
      discover: { enabled: false },
      architect: { enabled: false },
      hu_reviewer: { enabled: false },
      auto_simplify: true,
    }
  ),
  review_mode: v.optional(v.picklist(["paranoid", "strict", "standard", "relaxed", "custom"], "Invalid review_mode"), "standard"),
  max_iterations: v.optional(v.number("Invalid max_iterations"), 5),
  max_budget_usd: v.optional(v.nullable(v.number()), null),
  review_rules: v.optional(v.string(), "./.karajan/review-rules.md"),
  coder_rules: v.optional(v.string(), "./.karajan/coder-rules.md"),
  base_branch: v.optional(v.string(), "main"),
  coder_options: v.optional(
    v.object({
      model: v.optional(v.nullable(v.string()), null),
      auto_approve: v.optional(v.boolean(), true),
      fallback_coder: v.optional(v.nullable(v.string()), null),
    }),
    { model: null, auto_approve: true, fallback_coder: null }
  ),
  reviewer_options: v.optional(
    v.object({
      output_format: v.optional(v.string(), "json"),
      require_schema: v.optional(v.boolean(), true),
      model: v.optional(v.nullable(v.string()), null),
      deterministic: v.optional(v.boolean(), true),
      retries: v.optional(v.number(), 1),
      fallback_reviewer: v.optional(v.nullable(v.string()), null),
    }),
    {
      output_format: "json",
      require_schema: true,
      model: null,
      deterministic: true,
      retries: 1,
      fallback_reviewer: null,
    }
  ),
  development: v.optional(
    v.object({
      methodology: v.optional(v.picklist(["tdd", "standard"], "Invalid methodology"), "tdd"),
      require_test_changes: v.optional(v.boolean(), true),
      test_file_patterns: v.optional(v.array(v.string()), ["/tests/", "/__tests__/", ".test.", ".spec."]),
      source_file_extensions: v.optional(v.array(v.string()), [
        ".js",
        ".jsx",
        ".ts",
        ".tsx",
        ".py",
        ".go",
        ".java",
        ".rb",
        ".php",
        ".cs",
      ]),
    }),
    {
      methodology: "tdd",
      require_test_changes: true,
      test_file_patterns: ["/tests/", "/__tests__/", ".test.", ".spec."],
      source_file_extensions: [".js", ".jsx", ".ts", ".tsx", ".py", ".go", ".java", ".rb", ".php", ".cs"],
    }
  ),
  sonarqube: v.optional(
    v.object({
      enabled: v.optional(v.boolean(), true),
      host: v.optional(v.string(), "http://localhost:9000"),
      external: v.optional(v.boolean(), false),
      container_name: v.optional(v.string(), "karajan-sonarqube"),
      network: v.optional(v.string(), "karajan_sonar_net"),
      volumes: v.optional(
        v.object({
          data: v.optional(v.string(), "karajan_sonar_data"),
          logs: v.optional(v.string(), "karajan_sonar_logs"),
          extensions: v.optional(v.string(), "karajan_sonar_extensions"),
        }),
        {
          data: "karajan_sonar_data",
          logs: "karajan_sonar_logs",
          extensions: "karajan_sonar_extensions",
        }
      ),
      timeouts: v.optional(
        v.object({
          healthcheck_seconds: v.optional(v.number(), 5),
          compose_up_ms: v.optional(v.number(), 300000),
          compose_control_ms: v.optional(v.number(), 120000),
          logs_ms: v.optional(v.number(), 30000),
          scanner_ms: v.optional(v.number(), 900000),
        }),
        {
          healthcheck_seconds: 5,
          compose_up_ms: 300000,
          compose_control_ms: 120000,
          logs_ms: 30000,
          scanner_ms: 900000,
        }
      ),
      token: v.optional(v.nullable(v.string()), null),
      project_key: v.optional(v.nullable(v.string()), null),
      admin_user: v.optional(v.nullable(v.string()), null),
      admin_password: v.optional(v.nullable(v.string()), null),
      coverage: v.optional(
        v.object({
          enabled: v.optional(v.boolean(), false),
          command: v.optional(v.nullable(v.string()), null),
          timeout_ms: v.optional(v.number(), 300000),
          block_on_failure: v.optional(v.boolean(), true),
          lcov_report_path: v.optional(v.nullable(v.string()), null),
        }),
        {
          enabled: false,
          command: null,
          timeout_ms: 300000,
          block_on_failure: true,
          lcov_report_path: null,
        }
      ),
      quality_gate: v.optional(v.boolean(), true),
      enforcement_profile: v.optional(v.string(), "pragmatic"),
      gate_block_on: v.optional(v.array(v.string()), [
        "new_reliability_rating=E",
        "new_security_rating=E",
        "new_maintainability_rating=E",
        "new_coverage<80",
        "new_duplicated_lines_density>5",
      ]),
      fail_on: v.optional(v.array(v.string()), ["BLOCKER", "CRITICAL"]),
      ignore_on: v.optional(v.array(v.string()), ["INFO"]),
      max_scan_retries: v.optional(v.number(), 3),
      scanner: v.optional(
        v.object({
          sources: v.optional(v.string(), "src,public,lib"),
          exclusions: v.optional(
            v.string(),
            "**/node_modules/**,**/fake-apps/**,**/scripts/**,**/playground/**,**/dist/**,**/build/**,**/*.min.js"
          ),
          test_inclusions: v.optional(v.string(), "**/*.test.js,**/*.spec.js,**/tests/**,**/__tests__/**"),
          coverage_exclusions: v.optional(v.string(), "**/tests/**,**/__tests__/**,**/*.test.js,**/*.spec.js"),
          disabled_rules: v.optional(v.array(v.string()), ["javascript:S1116", "javascript:S3776"]),
        }),
        {
          sources: "src,public,lib",
          exclusions:
            "**/node_modules/**,**/fake-apps/**,**/scripts/**,**/playground/**,**/dist/**,**/build/**,**/*.min.js",
          test_inclusions: "**/*.test.js,**/*.spec.js,**/tests/**,**/__tests__/**",
          coverage_exclusions: "**/tests/**,**/__tests__/**,**/*.test.js,**/*.spec.js",
          disabled_rules: ["javascript:S1116", "javascript:S3776"],
        }
      ),
    }),
    {
      enabled: true,
      host: "http://localhost:9000",
      external: false,
      container_name: "karajan-sonarqube",
      network: "karajan_sonar_net",
      volumes: {
        data: "karajan_sonar_data",
        logs: "karajan_sonar_logs",
        extensions: "karajan_sonar_extensions",
      },
      timeouts: {
        healthcheck_seconds: 5,
        compose_up_ms: 300000,
        compose_control_ms: 120000,
        logs_ms: 30000,
        scanner_ms: 900000,
      },
      token: null,
      project_key: null,
      admin_user: null,
      admin_password: null,
      coverage: {
        enabled: false,
        command: null,
        timeout_ms: 300000,
        block_on_failure: true,
        lcov_report_path: null,
      },
      quality_gate: true,
      enforcement_profile: "pragmatic",
      gate_block_on: [
        "new_reliability_rating=E",
        "new_security_rating=E",
        "new_maintainability_rating=E",
        "new_coverage<80",
        "new_duplicated_lines_density>5",
      ],
      fail_on: ["BLOCKER", "CRITICAL"],
      ignore_on: ["INFO"],
      max_scan_retries: 3,
      scanner: {
        sources: "src,public,lib",
        exclusions:
          "**/node_modules/**,**/fake-apps/**,**/scripts/**,**/playground/**,**/dist/**,**/build/**,**/*.min.js",
        test_inclusions: "**/*.test.js,**/*.spec.js,**/tests/**,**/__tests__/**",
        coverage_exclusions: "**/tests/**,**/__tests__/**,**/*.test.js,**/*.spec.js",
        disabled_rules: ["javascript:S1116", "javascript:S3776"],
      },
    }
  ),
  sonarcloud: v.optional(
    v.object({
      enabled: v.optional(v.boolean(), false),
      organization: v.optional(v.nullable(v.string()), null),
      token: v.optional(v.nullable(v.string()), null),
      project_key: v.optional(v.nullable(v.string()), null),
      host: v.optional(v.string(), "https://sonarcloud.io"),
      scanner: v.optional(
        v.object({
          sources: v.optional(v.string(), "src,public,lib"),
          exclusions: v.optional(v.string(), "**/node_modules/**,**/dist/**,**/build/**,**/*.min.js"),
          test_inclusions: v.optional(v.string(), "**/*.test.js,**/*.spec.js,**/tests/**,**/__tests__/**"),
        }),
        {
          sources: "src,public,lib",
          exclusions: "**/node_modules/**,**/dist/**,**/build/**,**/*.min.js",
          test_inclusions: "**/*.test.js,**/*.spec.js,**/tests/**,**/__tests__/**",
        }
      ),
    }),
    {
      enabled: false,
      organization: null,
      token: null,
      project_key: null,
      host: "https://sonarcloud.io",
      scanner: {
        sources: "src,public,lib",
        exclusions: "**/node_modules/**,**/dist/**,**/build/**,**/*.min.js",
        test_inclusions: "**/*.test.js,**/*.spec.js,**/tests/**,**/__tests__/**",
      },
    }
  ),
  hu_board: v.optional(
    v.object({
      enabled: v.optional(v.boolean(), false),
      port: v.optional(v.number(), 4000),
      auto_start: v.optional(v.boolean(), false),
    }),
    { enabled: false, port: 4000, auto_start: false }
  ),
  language: v.optional(v.string(), "en"),
  hu_language: v.optional(v.string(), "en"),
  policies: v.optional(v.record(v.string(), v.any()), {}),
  serena: v.optional(
    v.object({
      enabled: v.optional(v.boolean(), false),
    }),
    { enabled: false }
  ),
  planning_game: v.optional(
    v.object({
      enabled: v.optional(v.boolean(), false),
      project_id: v.optional(v.nullable(v.string()), null),
      codeveloper: v.optional(v.nullable(v.string()), null),
    }),
    { enabled: false, project_id: null, codeveloper: null }
  ),
  becaria: v.optional(
    v.object({
      enabled: v.optional(v.boolean(), false),
      review_event: v.optional(v.string(), "becaria-review"),
      comment_event: v.optional(v.string(), "becaria-comment"),
      comment_prefix: v.optional(v.boolean(), true),
    }),
    {
      enabled: false,
      review_event: "becaria-review",
      comment_event: "becaria-comment",
      comment_prefix: true,
    }
  ),
  git: v.optional(
    v.object({
      auto_commit: v.optional(v.boolean(), false),
      auto_push: v.optional(v.boolean(), false),
      auto_pr: v.optional(v.boolean(), false),
      auto_rebase: v.optional(v.boolean(), true),
      branch_prefix: v.optional(v.string(), "feat/"),
    }),
    {
      auto_commit: false,
      auto_push: false,
      auto_pr: false,
      auto_rebase: true,
      branch_prefix: "feat/",
    }
  ),
  output: v.optional(
    v.object({
      report_dir: v.optional(v.string(), "./.reviews"),
      log_level: v.optional(v.string(), "info"),
      quiet: v.optional(v.boolean(), true),
    }),
    { report_dir: "./.reviews", log_level: "info", quiet: true }
  ),
  budget: v.optional(
    v.object({
      warn_threshold_pct: v.optional(v.number(), 80),
      currency: v.optional(v.string(), "usd"),
      exchange_rate_eur: v.optional(v.number(), 0.92),
      pricing: v.optional(v.record(v.string(), v.any()), {}),
    }),
    {
      warn_threshold_pct: 80,
      currency: "usd",
      exchange_rate_eur: 0.92,
      pricing: {},
    }
  ),
  model_selection: v.optional(
    v.object({
      enabled: v.optional(v.boolean(), true),
      tiers: v.optional(v.record(v.string(), v.any()), {}),
      role_overrides: v.optional(v.record(v.string(), v.any()), {}),
    }),
    {
      enabled: true,
      tiers: {},
      role_overrides: {},
    }
  ),
  session: v.optional(
    v.object({
      max_iteration_minutes: v.optional(v.number(), 30),
      max_total_minutes: v.optional(v.number(), 120),
      max_planner_minutes: v.optional(v.number(), 60),
      checkpoint_interval_minutes: v.optional(v.number(), 5),
      max_agent_silence_minutes: v.optional(v.number(), 20),
      fail_fast_repeats: v.optional(v.number(), 2),
      repeat_detection_threshold: v.optional(v.number(), 2),
      max_sonar_retries: v.optional(v.number(), 3),
      max_reviewer_retries: v.optional(v.number(), 3),
      max_tester_retries: v.optional(v.number(), 1),
      max_security_retries: v.optional(v.number(), 1),
      max_auto_resumes: v.optional(v.number(), 2),
      expiry_days: v.optional(v.number(), 30),
    }),
    {
      max_iteration_minutes: 30,
      max_total_minutes: 120,
      max_planner_minutes: 60,
      checkpoint_interval_minutes: 5,
      max_agent_silence_minutes: 20,
      fail_fast_repeats: 2,
      repeat_detection_threshold: 2,
      max_sonar_retries: 3,
      max_reviewer_retries: 3,
      max_tester_retries: 1,
      max_security_retries: 1,
      max_auto_resumes: 2,
      expiry_days: 30,
    }
  ),
  failFast: v.optional(
    v.object({
      repeatThreshold: v.optional(v.number(), 2),
    }),
    { repeatThreshold: 2 }
  ),
  retry: v.optional(
    v.object({
      max_attempts: v.optional(v.number(), 3),
      initial_backoff_ms: v.optional(v.number(), 1000),
      max_backoff_ms: v.optional(v.number(), 30000),
      backoff_multiplier: v.optional(v.number(), 2),
      jitter_factor: v.optional(v.number(), 0.1),
    }),
    {
      max_attempts: 3,
      initial_backoff_ms: 1000,
      max_backoff_ms: 30000,
      backoff_multiplier: 2,
      jitter_factor: 0.1,
    }
  ),
  webperf: v.optional(
    v.object({
      enabled: v.optional(v.boolean(), true),
      devtools_mcp: v.optional(v.boolean(), false),
      thresholds: v.optional(
        v.object({
          lcp: v.optional(v.number(), 2500),
          cls: v.optional(v.number(), 0.1),
          inp: v.optional(v.number(), 200),
        }),
        { lcp: 2500, cls: 0.1, inp: 200 }
      ),
    }),
    {
      enabled: true,
      devtools_mcp: false,
      thresholds: { lcp: 2500, cls: 0.1, inp: 200 },
    }
  ),
  telemetry: v.optional(v.boolean(), true),
  proxy: v.optional(
    v.object({
      enabled: v.optional(v.boolean(), true),
      port: v.optional(v.union([v.number(), v.string()]), "auto"),
      compression: v.optional(
        v.object({
          enabled: v.optional(v.boolean(), true),
          ai_compression: v.optional(v.boolean(), false),
          ai_model: v.optional(v.string(), "haiku"),
          ai_provider: v.optional(v.string(), "anthropic"),
          layers: v.optional(
            v.object({
              git: v.optional(v.boolean(), true),
              tests: v.optional(v.boolean(), true),
              build: v.optional(v.boolean(), true),
              infra: v.optional(v.boolean(), true),
              packages: v.optional(v.boolean(), true),
              read_dedup: v.optional(v.boolean(), true),
              glob_truncate: v.optional(v.boolean(), true),
              grep_collapse: v.optional(v.boolean(), true),
            }),
            {
              git: true,
              tests: true,
              build: true,
              infra: true,
              packages: true,
              read_dedup: true,
              glob_truncate: true,
              grep_collapse: true,
            }
          ),
          pressure_thresholds: v.optional(
            v.object({
              low: v.optional(v.number(), 0.5),
              medium: v.optional(v.number(), 0.8),
              high: v.optional(v.number(), 0.9),
            }),
            {
              low: 0.5,
              medium: 0.8,
              high: 0.9,
            }
          ),
        }),
        {
          enabled: true,
          ai_compression: false,
          ai_model: "haiku",
          ai_provider: "anthropic",
          layers: {
            git: true,
            tests: true,
            build: true,
            infra: true,
            packages: true,
            read_dedup: true,
            glob_truncate: true,
            grep_collapse: true,
          },
          pressure_thresholds: {
            low: 0.5,
            medium: 0.8,
            high: 0.9,
          },
        }
      ),
      cache: v.optional(
        v.object({
          persist_to_disk: v.optional(v.boolean(), true),
          flush_interval_ms: v.optional(v.number(), 5000),
        }),
        {
          persist_to_disk: true,
          flush_interval_ms: 5000,
        }
      ),
      inject_prompts: v.optional(v.boolean(), true),
      monitor: v.optional(v.boolean(), true),
    }),
    {
      enabled: true,
      port: "auto",
      compression: {
        enabled: true,
        ai_compression: false,
        ai_model: "haiku",
        ai_provider: "anthropic",
        layers: {
          git: true,
          tests: true,
          build: true,
          infra: true,
          packages: true,
          read_dedup: true,
          glob_truncate: true,
          grep_collapse: true,
        },
        pressure_thresholds: {
          low: 0.5,
          medium: 0.8,
          high: 0.9,
        },
      },
      cache: {
        persist_to_disk: true,
        flush_interval_ms: 5000,
      },
      inject_prompts: true,
      monitor: true,
    }
  ),
  guards: v.optional(
    v.object({
      output: v.optional(
        v.object({
          enabled: v.optional(v.boolean(), true),
          patterns: v.optional(v.array(v.string()), []),
          protected_files: v.optional(v.array(v.string()), []),
          on_violation: v.optional(v.string(), "block"),
        }),
        {
          enabled: true,
          patterns: [],
          protected_files: [],
          on_violation: "block",
        }
      ),
      perf: v.optional(
        v.object({
          enabled: v.optional(v.boolean(), true),
          patterns: v.optional(v.array(v.string()), []),
          block_on_warning: v.optional(v.boolean(), false),
          frontend_extensions: v.optional(v.array(v.string()), []),
        }),
        {
          enabled: true,
          patterns: [],
          block_on_warning: false,
          frontend_extensions: [],
        }
      ),
      intent: v.optional(
        v.object({
          enabled: v.optional(v.boolean(), false),
          patterns: v.optional(v.array(v.string()), []),
          confidence_threshold: v.optional(v.number(), 0.85),
        }),
        {
          enabled: false,
          patterns: [],
          confidence_threshold: 0.85,
        }
      ),
    }),
    {
      output: {
        enabled: true,
        patterns: [],
        protected_files: [],
        on_violation: "block",
      },
      perf: {
        enabled: true,
        patterns: [],
        block_on_warning: false,
        frontend_extensions: [],
      },
      intent: {
        enabled: false,
        patterns: [],
        confidence_threshold: 0.85,
      },
    }
  ),
});
