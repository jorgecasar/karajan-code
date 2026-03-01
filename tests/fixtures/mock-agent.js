import { BaseAgent } from "../../src/agents/base-agent.js";

export class MockAgent extends BaseAgent {
  constructor({
    name = "mock",
    config = { session: { max_iteration_minutes: 5 } },
    logger = { info() {}, warn() {}, error() {}, debug() {} },
    runTaskResult = { ok: true, output: "" },
    reviewTaskResult = { ok: true, output: "{}" },
  } = {}) {
    super(name, config, logger);
    this._runTaskResult = runTaskResult;
    this._reviewTaskResult = reviewTaskResult;
    this.runTaskCalls = [];
    this.reviewTaskCalls = [];
  }

  async runTask(task) {
    this.runTaskCalls.push(task);
    if (typeof this._runTaskResult === "function") {
      return this._runTaskResult(task, this.runTaskCalls.length);
    }
    return this._runTaskResult;
  }

  async reviewTask(task) {
    this.reviewTaskCalls.push(task);
    if (typeof this._reviewTaskResult === "function") {
      return this._reviewTaskResult(task, this.reviewTaskCalls.length);
    }
    return this._reviewTaskResult;
  }
}
