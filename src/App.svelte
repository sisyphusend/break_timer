<script>
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { onMount } from "svelte";
  import CronBuilder from "./lib/CronBuilder.svelte";

  // ============================================================
  // 状态
  // ============================================================

  let config = $state({
    mode: "interval",
    interval_minutes: 30,
    cron_expression: "0 */30 * * * * *",
    break_seconds: 20,
  });

  // CronBuilder 的双向绑定值 (与 config.cron_expression 保持同步)
  let cronValue = $state("0 */30 * * * * *");

  // cronValue -> config (用户改 cron builder 时)
  $effect(() => {
    config = { ...config, cron_expression: cronValue };
  });

  let status = $state({ running: false, next_break_at: null });

  // 派生显示文本
  let statusText = $derived(status.running ? "运行中" : "未启动");
  let statusClass = $derived(status.running ? "status running" : "status stopped");
  let nextText = $derived(
    status.next_break_at
      ? `下次休息：${new Date(status.next_break_at).toLocaleString("zh-CN")}`
      : ""
  );

  // ============================================================
  // 生命周期
  // ============================================================

  onMount(async () => {
    // 加载保存的配置 + 当前状态
    try {
      const cfg = await invoke("get_config");
      config = { ...cfg };
      // 把后端保存的 cron 值同步到 CronBuilder
      cronValue = cfg.cron_expression;
    } catch (err) {
      console.error("get_config:", err);
    }
    try {
      status = await invoke("get_status");
    } catch (err) {
      console.error("get_status:", err);
    }

    // 定时刷新状态
    const timer = setInterval(async () => {
      try {
        status = await invoke("get_status");
      } catch (err) {
        console.error("status poll:", err);
      }
    }, 5000);

    // 托盘菜单事件 (Rust emit 过来)
    const off1 = listen("tray-toggle-scheduler", toggleScheduler);
    const off2 = listen("tray-trigger-break", triggerBreak);

    return () => {
      clearInterval(timer);
      off1.then((fn) => fn());
      off2.then((fn) => fn());
    };
  });

  // ============================================================
  // 业务操作
  // ============================================================

  async function toggleScheduler() {
    try {
      const newRunning = !status.running;
      if (status.running) {
        status = await invoke("stop_scheduler");
      } else {
        status = await invoke("start_scheduler");
      }
    } catch (err) {
      console.error("toggle:", err);
    }
  }

  async function triggerBreak() {
    try {
      await invoke("trigger_break");
    } catch (err) {
      console.error("trigger:", err);
    }
  }

  // 收集当前表单 → config (期望后端格式)
  function readConfig() {
    return {
      mode: config.mode,
      interval_minutes:
        parseInt(String(config.interval_minutes), 10) || 30,
      cron_expression: config.cron_expression,
      break_seconds: parseInt(String(config.break_seconds), 10) || 20,
    };
  }

  async function startScheduler() {
    try {
      const cfg = readConfig();
      await invoke("save_config", { config: cfg });
      status = await invoke("start_scheduler");
    } catch (err) {
      alert("启动失败：" + err);
    }
  }

  async function stopScheduler() {
    try {
      status = await invoke("stop_scheduler");
    } catch (err) {
      alert("停止失败：" + err);
    }
  }

  async function testBreak() {
    try {
      const cfg = readConfig();
      await invoke("save_config", { config: cfg });
      await invoke("trigger_break");
    } catch (err) {
      alert("测试失败：" + err);
    }
  }

  // 模式切换
  function onModeChange(event) {
    config = { ...config, mode: event.target.value };
  }

  // cron 值变化 (由 $effect 同步到 config)
</script>

<main class="container">
  <header>
    <h1>BreakTimer</h1>
    <p class="subtitle">到点全屏提醒，护眼护身体</p>
  </header>

  <section class="card">
    <h2>调度方式</h2>
    <div class="mode-switch">
      <label class="mode-option">
        <input
          type="radio"
          name="mode"
          value="interval"
          checked={config.mode === "interval"}
          onchange={onModeChange}
        />
        <span>固定间隔</span>
      </label>
      <label class="mode-option">
        <input
          type="radio"
          name="mode"
          value="cron"
          checked={config.mode === "cron"}
          onchange={onModeChange}
        />
        <span>Cron 表达式</span>
      </label>
    </div>

    {#if config.mode === "interval"}
      <div class="field">
        <label for="interval-min">间隔分钟数</label>
        <input
          id="interval-min"
          type="number"
          min="1"
          bind:value={config.interval_minutes}
        />
      </div>
    {:else}
      <div class="field">
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label>触发规则</label>
        <CronBuilder
          initialCron={cronValue}
          bind:cron={cronValue}
        />
      </div>
    {/if}
  </section>

  <section class="card">
    <h2>休息时长</h2>
    <div class="field">
      <label for="break-sec">休息秒数</label>
      <input
        id="break-sec"
        type="number"
        min="5"
        bind:value={config.break_seconds}
      />
    </div>
  </section>

  <section class="card">
    <h2>状态</h2>
    <p class={statusClass}>{statusText}</p>
    <p class="next">{nextText}</p>
  </section>

  <div class="actions">
    <button
      class="btn primary"
      disabled={status.running}
      onclick={startScheduler}
    >
      启动
    </button>
    <button
      class="btn ghost"
      disabled={!status.running}
      onclick={stopScheduler}
    >
      停止
    </button>
    <button class="btn ghost" onclick={testBreak}>立即测试</button>
  </div>
</main>

<style>
  .container {
    max-width: 520px;
    margin: 0 auto;
    padding: 32px 24px 80px;
  }

  header { margin-bottom: 24px; }

  h1 {
    margin: 0 0 4px;
    font-size: 24px;
    font-weight: 600;
  }

  .subtitle {
    margin: 0;
    color: var(--text-dim);
    font-size: 13px;
  }

  .card {
    background: var(--card);
    border: 1px solid var(--card-border);
    border-radius: 10px;
    padding: 20px;
    margin-bottom: 16px;
  }

  .card h2 {
    margin: 0 0 16px;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .field { margin-bottom: 12px; }
  .field:last-child { margin-bottom: 0; }

  label {
    display: block;
    margin-bottom: 6px;
    font-size: 13px;
    color: var(--text-dim);
  }

  input[type="number"] {
    width: 100%;
    padding: 10px 12px;
    background: #0b0d12;
    border: 1px solid var(--card-border);
    border-radius: 6px;
    color: var(--text);
    font-size: 14px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s;
  }

  input[type="number"]:focus { border-color: var(--primary); }

  .mode-switch {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }

  .mode-option {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px;
    background: #0b0d12;
    border: 1px solid var(--card-border);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .mode-option:hover { border-color: #3a4150; }
  .mode-option input { display: none; }

  .mode-option:has(input:checked) {
    background: rgba(79, 140, 255, 0.1);
    border-color: var(--primary);
    color: var(--primary);
  }

  .status { margin: 0; font-size: 14px; }
  .status.running { color: #4ade80; }
  .status.stopped { color: var(--text-dim); }

  .next {
    margin: 8px 0 0;
    font-size: 13px;
    color: var(--text-dim);
  }

  .actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  .btn {
    flex: 1;
    padding: 10px 16px;
    border: 1px solid var(--card-border);
    border-radius: 6px;
    background: var(--card);
    color: var(--text);
    font-size: 14px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn:hover:not(:disabled) { background: #232730; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .btn.primary {
    background: var(--primary);
    border-color: var(--primary);
    color: white;
  }

  .btn.primary:hover:not(:disabled) {
    background: var(--primary-hover);
    border-color: var(--primary-hover);
  }
</style>
