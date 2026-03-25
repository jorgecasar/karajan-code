const MODEL_NOT_SUPPORTED_PATTERNS = [
  /model.{0,30}is not supported/i,
  /model.{0,30}not available/i,
  /model.{0,30}does not exist/i,
  /unsupported model/i,
  /invalid model/i,
  /model_not_found/i
];

export class BaseAgent {
  constructor(name, config, logger) {
    this.name = name;
    this.config = config;
    this.logger = logger;
  }

  async runTask(_task) {
    throw new Error("runTask not implemented");
  }

  async reviewTask(_task) {
    throw new Error("reviewTask not implemented");
  }

  getRoleModel(role) {
    const roleModel = this.config?.roles?.[role]?.model;
    if (roleModel) return roleModel;
    if (role === "reviewer") return this.config?.reviewer_options?.model || null;
    return this.config?.coder_options?.model || null;
  }

  isAutoApproveEnabled(role) {
    if (role === "reviewer") return false;
    return Boolean(this.config?.coder_options?.auto_approve);
  }

  isModelNotSupportedError(result) {
    const text = [result?.error, result?.output, result?.stderr, result?.stdout]
      .filter(Boolean).join("\n");
    return MODEL_NOT_SUPPORTED_PATTERNS.some(re => re.test(text));
  }
}
