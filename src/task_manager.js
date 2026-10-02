const { randomUUID } = require("crypto");

class TaskManager {
  constructor(options = {}) {
    this.maxHistory = options.maxHistory || 50;

    this.activeTasks = new Map();
    this.history = [];
  }

  createTask(input = {}) {
    const id = this.generateTaskId();

    const controller = new AbortController();

    const task = {
      id,

      // Informasi dasar
      command: String(input.command || "").trim(),
      type: input.type || "general",

      // Status task
      status: "queued",

      // Progress
      currentStep: null,
      currentAction: null,
      steps: [],
      completedSteps: 0,
      totalSteps: input.totalSteps || null,

      // Waktu
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,

      // Error / hasil
      result: null,
      error: null,

      // Cancellation
      controller,

      // Metadata tambahan
      metadata: input.metadata || {},
    };

    this.activeTasks.set(id, task);

    return task;
  }

  generateTaskId() {
    const shortId = randomUUID()
      .replace(/-/g, "")
      .slice(0, 6)
      .toUpperCase();

    return `FANRA-${shortId}`;
  }

  startTask(taskId) {
    const task = this.activeTasks.get(taskId);

    if (!task) {
      return null;
    }

    task.status = "running";
    task.startedAt = new Date();

    return task;
  }

  setStep(taskId, step, action = null) {
    const task = this.activeTasks.get(taskId);

    if (!task) {
      return null;
    }

    task.currentStep = step;
    task.currentAction = action;

    task.steps.push({
      name: step,
      action,
      status: "running",
      startedAt: new Date(),
      completedAt: null,
    });

    return task;
  }

  completeStep(taskId, result = null) {
    const task = this.activeTasks.get(taskId);

    if (!task) {
      return null;
    }

    const currentStep = [...task.steps]
      .reverse()
      .find((step) => step.status === "running");

    if (currentStep) {
      currentStep.status = "completed";
      currentStep.completedAt = new Date();
      currentStep.result = result;
    }

    task.completedSteps += 1;

    return task;
  }

  failStep(taskId, error) {
    const task = this.activeTasks.get(taskId);

    if (!task) {
      return null;
    }

    const currentStep = [...task.steps]
      .reverse()
      .find((step) => step.status === "running");

    if (currentStep) {
      currentStep.status = "failed";
      currentStep.completedAt = new Date();
      currentStep.error = this.normalizeError(error);
    }

    return task;
  }

  completeTask(taskId, result = null) {
    const task = this.activeTasks.get(taskId);

    if (!task) {
      return null;
    }

    task.status = "completed";
    task.result = result;
    task.completedAt = new Date();

    task.currentAction = null;

    this.finishTask(taskId);

    return task;
  }

  failTask(taskId, error) {
    const task = this.activeTasks.get(taskId);

    if (!task) {
      return null;
    }

    task.status = "failed";
    task.error = this.normalizeError(error);
    task.completedAt = new Date();

    task.currentAction = null;

    this.finishTask(taskId);

    return task;
  }

  cancelTask(taskId, reason = "Task dibatalkan.") {
    const task = this.activeTasks.get(taskId);

    if (!task) {
      return null;
    }

    if (
      task.status === "completed" ||
      task.status === "failed" ||
      task.status === "cancelled"
    ) {
      return task;
    }

    task.status = "cancelled";
    task.error = reason;
    task.completedAt = new Date();

    task.currentAction = null;

    try {
      if (!task.controller.signal.aborted) {
        task.controller.abort();
      }
    } catch (error) {
      // Abort gagal tidak boleh merusak Task Manager.
    }

    this.finishTask(taskId);

    return task;
  }

  isCancelled(taskId) {
    const task = this.activeTasks.get(taskId);

    if (!task) {
      return false;
    }

    return (
      task.status === "cancelled" ||
      task.controller?.signal?.aborted === true
    );
  }

  getTask(taskId) {
    return this.activeTasks.get(taskId) || this.findHistoryTask(taskId);
  }

  getActiveTasks() {
    return Array.from(this.activeTasks.values());
  }

  getActiveTask(taskId) {
    return this.activeTasks.get(taskId) || null;
  }

  getHistory(limit = 20) {
    return this.history.slice(-limit).reverse();
  }

  getStats() {
    const active = this.getActiveTasks();

    return {
      active: active.length,

      queued: active.filter((task) => task.status === "queued").length,

      running: active.filter((task) => task.status === "running").length,

      completed: this.history.filter(
        (task) => task.status === "completed"
      ).length,

      failed: this.history.filter(
        (task) => task.status === "failed"
      ).length,

      cancelled: this.history.filter(
        (task) => task.status === "cancelled"
      ).length,
    };
  }

  updateTask(taskId, updates = {}) {
    const task = this.activeTasks.get(taskId);

    if (!task) {
      return null;
    }

    const allowedFields = [
      "type",
      "currentStep",
      "currentAction",
      "totalSteps",
      "completedSteps",
      "result",
      "metadata",
    ];

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(updates, field)) {
        task[field] = updates[field];
      }
    }

    return task;
  }

  addMetadata(taskId, key, value) {
    const task = this.activeTasks.get(taskId);

    if (!task) {
      return null;
    }

    task.metadata[key] = value;

    return task;
  }

  finishTask(taskId) {
    const task = this.activeTasks.get(taskId);

    if (!task) {
      return null;
    }

    this.activeTasks.delete(taskId);

    this.history.push(this.serializeTask(task));

    if (this.history.length > this.maxHistory) {
      this.history.splice(0, this.history.length - this.maxHistory);
    }

    return task;
  }

  findHistoryTask(taskId) {
    return (
      this.history.find((task) => task.id === taskId) || null
    );
  }

  normalizeError(error) {
    if (!error) {
      return "Unknown error";
    }

    if (typeof error === "string") {
      return error;
    }

    if (error.message) {
      return error.message;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  serializeTask(task) {
    return {
      id: task.id,
      command: task.command,
      type: task.type,

      status: task.status,

      currentStep: task.currentStep,
      currentAction: task.currentAction,

      steps: task.steps.map((step) => ({
        name: step.name,
        action: step.action,
        status: step.status,
        startedAt: step.startedAt,
        completedAt: step.completedAt,
        result: step.result,
        error: step.error,
      })),

      completedSteps: task.completedSteps,
      totalSteps: task.totalSteps,

      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,

      result: task.result,
      error: task.error,

      metadata: task.metadata,
    };
  }

  formatTask(task) {
    if (!task) {
      return "Task tidak ditemukan.";
    }

    const statusMap = {
      queued: "QUEUED",
      running: "RUNNING",
      completed: "COMPLETED",
      failed: "FAILED",
      cancelled: "CANCELLED",
    };

    const status = statusMap[task.status] || task.status.toUpperCase();

    const lines = [
      `TASK ${task.id}`,
      `Status      : ${status}`,
      `Type        : ${task.type}`,
      `Command     : ${task.command || "-"}`,
    ];

    if (task.currentStep) {
      lines.push(`Current step : ${task.currentStep}`);
    }

    if (task.currentAction) {
      lines.push(`Action       : ${task.currentAction}`);
    }

    if (task.totalSteps) {
      lines.push(
        `Progress     : ${task.completedSteps}/${task.totalSteps}`
      );
    } else if (task.completedSteps > 0) {
      lines.push(`Steps done   : ${task.completedSteps}`);
    }

    if (task.error) {
      lines.push(`Error        : ${task.error}`);
    }

    return lines.join("\n");
  }

  formatActiveTasks() {
    const tasks = this.getActiveTasks();

    if (tasks.length === 0) {
      return "Tidak ada task aktif.";
    }

    const lines = [
      "FANRA ACTIVE TASKS",
      "==================",
      "",
    ];

    for (const task of tasks) {
      const status =
        task.status === "running"
          ? "● RUNNING"
          : task.status === "queued"
            ? "○ QUEUED"
            : task.status.toUpperCase();

      lines.push(`${status}  ${task.id}`);
      lines.push(`      ${task.command || "-"}`);

      if (task.currentStep) {
        lines.push(`      Step: ${task.currentStep}`);
      }

      if (task.currentAction) {
        lines.push(`      Action: ${task.currentAction}`);
      }

      if (task.totalSteps) {
        lines.push(
          `      Progress: ${task.completedSteps}/${task.totalSteps}`
        );
      }

      lines.push("");
    }

    return lines.join("\n").trim();
  }
}

const taskManager = new TaskManager();

module.exports = {
  TaskManager,
  taskManager,
};