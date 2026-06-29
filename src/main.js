import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { CronBuilder } from "./cron-builder.js";

// 主窗口的 cron 构造器实例(由 applyConfig 时初始化)
let cronBuilder = null;

// 初始化：加载保存的配置
async function init() {
  const config = await invoke("get_config");
  applyConfig(config);
  const status = await invoke("get_status");
  applyStatus(status);
}

// 把 config 渲染到表单
function applyConfig(config) {
  document.querySelector(`input[name="mode"][value="${config.mode}"]`).checked = true;
  document.getElementById("interval-min").value = config.interval_minutes;
  document.getElementById("break-sec").value = config.break_seconds;
  toggleModeFields(config.mode);

  // 初始化 cron 构造器
  cronBuilder = new CronBuilder(
    document.getElementById("cron-builder"),
    config.cron_expression
  );
}

// 把状态渲染到 UI
function applyStatus(status) {
  const statusEl = document.getElementById("status-text");
  const nextEl = document.getElementById("next-text");

  if (status.running) {
    statusEl.textContent = "运行中";
    statusEl.className = "status running";
  } else {
    statusEl.textContent = "未启动";
    statusEl.className = "status stopped";
  }

  document.getElementById("start-btn").disabled = status.running;
  document.getElementById("stop-btn").disabled = !status.running;

  if (status.next_break_at) {
    const dt = new Date(status.next_break_at);
    nextEl.textContent = `下次休息：${dt.toLocaleString("zh-CN")}`;
  } else {
    nextEl.textContent = "";
  }
}

function toggleModeFields(mode) {
  document.getElementById("interval-field").hidden = mode !== "interval";
  document.getElementById("cron-field").hidden = mode !== "cron";
}

// 收集表单 → config 对象
function readConfig() {
  const mode = document.querySelector('input[name="mode"]:checked').value;
  return {
    mode,
    interval_minutes: parseInt(document.getElementById("interval-min").value, 10) || 30,
    cron_expression: cronBuilder ? cronBuilder.getValue() : "",
    break_seconds: parseInt(document.getElementById("break-sec").value, 10) || 20,
  };
}

// 绑定事件
function bindEvents() {
  document.querySelectorAll('input[name="mode"]').forEach((el) => {
    el.addEventListener("change", (e) => toggleModeFields(e.target.value));
  });

  document.getElementById("start-btn").addEventListener("click", async () => {
    try {
      const config = readConfig();
      await invoke("save_config", { config });
      const status = await invoke("start_scheduler");
      applyStatus(status);
    } catch (err) {
      alert("启动失败：" + err);
    }
  });

  document.getElementById("stop-btn").addEventListener("click", async () => {
    try {
      const status = await invoke("stop_scheduler");
      applyStatus(status);
    } catch (err) {
      alert("停止失败：" + err);
    }
  });

  document.getElementById("test-btn").addEventListener("click", async () => {
    try {
      const config = readConfig();
      await invoke("save_config", { config });
      await invoke("trigger_break");
    } catch (err) {
      alert("测试失败：" + err);
    }
  });

  // 定期刷新状态
  setInterval(async () => {
    const status = await invoke("get_status");
    applyStatus(status);
  }, 5000);

  // 托盘菜单事件(由 Rust 通过 emit 转过来)
  listen("tray-toggle-scheduler", async () => {
    try {
      const status = await invoke("get_status");
      if (status.running) {
        await invoke("stop_scheduler");
      } else {
        await invoke("start_scheduler");
      }
    } catch (err) {
      console.error("toggle:", err);
    }
  });

  listen("tray-trigger-break", async () => {
    try {
      await invoke("trigger_break");
    } catch (err) {
      console.error("trigger:", err);
    }
  });
}

init().then(bindEvents);
