<script>
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { onMount } from "svelte";
  import CronBuilder from "./lib/CronBuilder.svelte";
  import { formatCombo } from "./lib/hotkey.js";

  // ============================================================
  // 状态
  // ============================================================

  // 当前激活的 tab
  let activeTab = $state("basic");

  // 完整配置(8 个字段)
  let config = $state({
    mode: "interval",
    interval_minutes: 30,
    cron_expression: "0 0 */30 * * * *",
    break_seconds: 20,
    autostart: false,
    cancel_hotkey: "Escape",
    background_color: "#0F1115",
    background_opacity: 45,
  });

  // CronBuilder 内部用的镜像值(onMount 里从 config 同步)
  let cronValue = $state("0 */30 * * * * *");

  // 运行状态
  let status = $state({ running: false, next_break_at: null });

  // 未来 3 次触发时间
  let nextBreaks = $state([]);

  // 快捷键录制中
  let recording = $state(false);

  // 标记初始化是否完成(用于防止初始加载时触发自动保存)
  let initialLoadDone = $state(false);

  // ============================================================
  // 派生值
  // ============================================================

  let statusText = $derived(status.running ? "运行中" : "未启动");
  let statusClass = $derived(status.running ? "status running" : "status stopped");
  let nextText = $derived(
    status.next_break_at
      ? `下次休息：${new Date(status.next_break_at).toLocaleString("zh-CN")}`
      : ""
  );

  // 背景预览 rgba
  let previewBg = $derived(
    `rgba(${hexToRgb(config.background_color)}, ${config.background_opacity / 100})`
  );

  function hexToRgb(hex) {
    const m = hex.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
    if (!m) return "15, 17, 21";
    return `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}`;
  }

  // ============================================================
  // 生命周期
  // ============================================================

  onMount(async () => {
    // 加载配置
    try {
      const cfg = await invoke("get_config");
      config = { ...cfg };
      cronValue = cfg.cron_expression;
    } catch (err) {
      console.error("get_config:", err);
    }

    // 系统实际的 autostart 状态(可能和 config 不一致)
    try {
      const actual = await invoke("is_autostart_enabled");
      config = { ...config, autostart: actual };
    } catch (err) {
      console.error("is_autostart_enabled:", err);
    }

    // 当前运行状态
    try {
      status = await invoke("get_status");
    } catch (err) {
      console.error("get_status:", err);
    }

    // 自动启动调度器:返回式用户直接看到"运行中"状态
    if (!status.running) {
      try {
        status = await invoke("start_scheduler");
      } catch (err) {
        console.error("auto-start scheduler:", err);
      }
    }

    // 初次拉取未来触发时间
    refreshNextBreaks();

    // 定时刷新状态(每 5s)
    const timer = setInterval(async () => {
      try {
        status = await invoke("get_status");
      } catch {}
    }, 5000);

    // 全局 keydown 监听(快捷键录制 + 录制之外的全局取消)
    window.addEventListener("keydown", handleKeyDown);

    initialLoadDone = true;

    return () => {
      clearInterval(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  });

  // 托盘子菜单 3 项点了之后,后端直接调内部实现 + emit "scheduler-status"
  // 这条路径下前端只需要 listen 这个状态事件来同步 UI
  listen("scheduler-status", (event) => {
    status = event.payload;
  });

  // ============================================================
  // 持久化(防抖 500ms 自动保存)
  // ============================================================

  $effect(() => {
    const _ = JSON.stringify(config);
    if (!initialLoadDone) return;
    const t = setTimeout(() => {
      invoke("save_config", { config }).catch((err) =>
        console.error("save_config:", err)
      );
    }, 500);
    return () => clearTimeout(t);
  });

  // cronValue 同步到 config
  $effect(() => {
    config = { ...config, cron_expression: cronValue };
  });

  // 定时设置变更时拉未来 3 条(debounced)
  $effect(() => {
    const _ = [
      config.mode,
      config.interval_minutes,
      config.cron_expression,
    ].join("|");
    const t = setTimeout(refreshNextBreaks, 300);
    return () => clearTimeout(t);
  });

  async function refreshNextBreaks() {
    try {
      nextBreaks = await invoke("get_next_breaks", { count: 3 });
    } catch (err) {
      console.error("get_next_breaks:", err);
      nextBreaks = [];
    }
  }

  // ============================================================
  // 业务操作
  // ============================================================

  async function startScheduler() {
    try {
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
      await invoke("trigger_break");
    } catch (err) {
      alert("测试失败：" + err);
    }
  }

  async function onAutostartChange(event) {
    const want = event.target.checked;
    try {
      if (want) await invoke("enable_autostart");
      else await invoke("disable_autostart");
      config = { ...config, autostart: want };
    } catch (err) {
      alert("设置开机自启动失败：" + err);
      // 回滚 UI
      event.target.checked = !want;
    }
  }

  // ============================================================
  // 快捷键录制
  // ============================================================

  function toggleRecording() {
    recording = !recording;
  }

  function handleKeyDown(event) {
    if (!recording) return;
    const combo = formatCombo(event);
    if (combo) {
      config = { ...config, cancel_hotkey: combo };
      recording = false;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function clearHotkey() {
    config = { ...config, cancel_hotkey: "" };
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<main class="container">
  <header class="app-header">
    <h1>BreakTimer</h1>
    <p class="subtitle">到点全屏提醒，护眼护身体</p>
  </header>

  <!-- 运行状态卡(始终可见)— 启动/停止/测试按钮已迁移到托盘子菜单 -->
  <section class="card">
    <h2>运行状态</h2>
    <p class={statusClass}>{statusText}</p>
    <p class="next">{nextText}</p>
    <p class="hint">启动 / 停止 / 立即测试 → 托盘右键 → 状态</p>
  </section>

  <!-- Tab 导航 -->
  <div class="tabs" role="tablist">
    <button
      role="tab"
      class:active={activeTab === "basic"}
      onclick={() => (activeTab = "basic")}
    >
      基础设置
    </button>
    <button
      role="tab"
      class:active={activeTab === "schedule"}
      onclick={() => (activeTab = "schedule")}
    >
      定时设置
    </button>
    <button
      role="tab"
      class:active={activeTab === "background"}
      onclick={() => (activeTab = "background")}
    >
      背景设置
    </button>
  </div>

  <!-- 基础设置 -->
  {#if activeTab === "basic"}
    <section class="card">
      <h2>基础设置</h2>

      <div class="setting-row">
        <div class="setting-meta">
          <div class="setting-label">开机自启动</div>
          <small class="hint">登录 Windows 时自动启动 BreakTimer 到托盘</small>
        </div>
        <label class="switch" title="开关">
          <input
            type="checkbox"
            checked={config.autostart}
            onchange={onAutostartChange}
          />
          <span class="slider"></span>
        </label>
      </div>

      <div class="setting-row">
        <div class="setting-meta">
          <div class="setting-label">取消休息快捷键</div>
          <small class="hint">在休息遮罩显示时按下立即关闭</small>
        </div>
        <div class="hotkey-control">
          <button
            type="button"
            class="hotkey-btn"
            class:recording
            onclick={toggleRecording}
          >
            {recording ? "请按键..." : config.cancel_hotkey || "未设置"}
          </button>
          {#if config.cancel_hotkey && !recording}
            <button type="button" class="hotkey-clear" onclick={clearHotkey}>
              清除
            </button>
          {/if}
        </div>
      </div>
    </section>
  {/if}

  <!-- 定时设置 -->
  {#if activeTab === "schedule"}
    <section class="card">
      <h2>定时设置</h2>

      <div class="mode-switch">
        <label class="mode-option">
          <input
            type="radio"
            name="mode"
            value="interval"
            checked={config.mode === "interval"}
            onchange={() => (config = { ...config, mode: "interval" })}
          />
          <span>固定间隔</span>
        </label>
        <label class="mode-option">
          <input
            type="radio"
            name="mode"
            value="cron"
            checked={config.mode === "cron"}
            onchange={() => (config = { ...config, mode: "cron" })}
          />
          <span>crontab</span>
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
          <label>cron 表达式</label>
          <CronBuilder
            initialCron={cronValue}
            bind:cron={cronValue}
          />
        </div>
      {/if}

      <div class="field">
        <label for="break-sec">休息时间（秒）</label>
        <input
          id="break-sec"
          type="number"
          min="5"
          bind:value={config.break_seconds}
        />
      </div>

      {#if nextBreaks.length > 0}
        <div class="next-breaks">
          <div class="next-breaks-label">接下来的 3 次触发时间</div>
          <ul>
            {#each nextBreaks as t}
              <li>{new Date(t).toLocaleString("zh-CN")}</li>
            {/each}
          </ul>
        </div>
      {/if}
    </section>
  {/if}

  <!-- 背景设置 -->
  {#if activeTab === "background"}
    <section class="card">
      <h2>背景设置</h2>

      <div class="field">
        <label for="bg-color">背景颜色</label>
        <div class="color-row">
          <input
            id="bg-color"
            type="color"
            bind:value={config.background_color}
          />
          <input
            class="hex-input"
            type="text"
            bind:value={config.background_color}
            maxlength="7"
            placeholder="#000000"
          />
        </div>
      </div>

      <div class="field">
        <label for="bg-opacity">
          透明度 ({config.background_opacity}%)
        </label>
        <input
          id="bg-opacity"
          type="range"
          min="0"
          max="100"
          bind:value={config.background_opacity}
        />
      </div>

      <div class="preview-label">实时预览</div>
      <div class="bg-preview" style:background={previewBg}></div>
    </section>
  {/if}

  <!-- (运行状态 + 启动/停止 / 测试 已上移到顶部) -->
</main>

<style>
  .container {
    max-width: 540px;
    margin: 0 auto;
    padding: 24px 24px 60px;
  }

  header.app-header {
    margin-bottom: 20px;
    text-align: center;
  }

  h1 {
    margin: 0 0 4px;
    font-size: 22px;
    font-weight: 600;
  }

  .subtitle {
    margin: 0;
    color: var(--text-dim);
    font-size: 13px;
  }

  /* Tab 导航 */
  .tabs {
    display: flex;
    gap: 4px;
    padding: 4px;
    background: #0b0d12;
    border: 1px solid var(--card-border);
    border-radius: 10px;
    margin-bottom: 16px;
  }

  .tabs button {
    flex: 1;
    padding: 8px 12px;
    background: transparent;
    border: none;
    color: var(--text-dim);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
    font-size: 13px;
  }

  .tabs button:hover { color: var(--text); }
  .tabs button.active {
    background: var(--primary);
    color: white;
  }

  /* Card */
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

  /* 字段 */
  .field { margin-bottom: 14px; }
  .field:last-child { margin-bottom: 0; }

  label {
    display: block;
    margin-bottom: 6px;
    font-size: 13px;
    color: var(--text-dim);
  }

  input[type="number"], input[type="text"] {
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

  input[type="number"]:focus, input[type="text"]:focus { border-color: var(--primary); }

  .hint {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    color: var(--text-dim);
  }

  /* Setting row (label + control on right) */
  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 0;
    border-bottom: 1px solid #23273020;
  }

  .setting-row:last-child { border-bottom: none; }

  .setting-meta { flex: 1; }

  .setting-label {
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 2px;
  }

  /* Switch */
  .switch {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
    flex-shrink: 0;
  }

  .switch input { display: none; }

  .switch .slider {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background: #2a2f3a;
    border-radius: 24px;
    transition: 0.2s;
  }

  .switch .slider::before {
    content: "";
    position: absolute;
    height: 18px;
    width: 18px;
    left: 3px;
    top: 3px;
    background: white;
    border-radius: 50%;
    transition: 0.2s;
  }

  .switch input:checked + .slider { background: var(--primary); }
  .switch input:checked + .slider::before { transform: translateX(20px); }

  /* Hotkey */
  .hotkey-control { display: flex; gap: 6px; align-items: center; }

  .hotkey-btn {
    padding: 8px 14px;
    background: #0b0d12;
    border: 1px solid var(--card-border);
    border-radius: 6px;
    color: var(--text);
    cursor: pointer;
    font-family: "Consolas", "Monaco", monospace;
    font-size: 13px;
    min-width: 100px;
    text-align: center;
  }

  .hotkey-btn.recording {
    border-color: var(--primary);
    color: var(--primary);
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  .hotkey-clear {
    padding: 8px 12px;
    background: transparent;
    border: 1px solid var(--card-border);
    border-radius: 6px;
    color: var(--text-dim);
    cursor: pointer;
    font-size: 12px;
  }

  .hotkey-clear:hover { color: var(--danger); border-color: var(--danger); }

  /* Mode switch */
  .mode-switch {
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
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

  /* Next breaks */
  .next-breaks {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid #23273020;
  }

  .next-breaks-label {
    font-size: 12px;
    color: var(--text-dim);
    margin-bottom: 8px;
  }

  .next-breaks ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .next-breaks li {
    padding: 6px 10px;
    background: #0b0d12;
    border-radius: 4px;
    margin-bottom: 4px;
    font-family: "Consolas", "Monaco", monospace;
    font-size: 12px;
    color: var(--primary);
  }

  /* Color picker */
  .color-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .color-row input[type="color"] {
    width: 48px;
    height: 36px;
    padding: 2px;
    border: 1px solid var(--card-border);
    border-radius: 6px;
    background: #0b0d12;
    cursor: pointer;
  }

  .hex-input {
    flex: 1;
    font-family: "Consolas", "Monaco", monospace !important;
  }

  /* Range slider */
  input[type="range"] {
    width: 100%;
    accent-color: var(--primary);
  }

  .preview-label {
    font-size: 12px;
    color: var(--text-dim);
    margin: 14px 0 6px;
  }

  .bg-preview {
    height: 80px;
    border-radius: 8px;
    border: 1px solid var(--card-border);
    background: #000;
    background-image:
      linear-gradient(45deg, #444 25%, transparent 25%),
      linear-gradient(-45deg, #444 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #444 75%),
      linear-gradient(-45deg, transparent 75%, #444 75%);
    background-size: 16px 16px;
    background-position: 0 0, 0 8px, 8px -8px, -8px 0;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04);
  }

  /* Status / Actions */
  .status { margin: 0 0 4px; font-size: 14px; }
  .status.running { color: #4ade80; }
  .status.stopped { color: var(--text-dim); }

  .next {
    margin: 0 0 14px;
    font-size: 13px;
    color: var(--text-dim);
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .btn {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid var(--card-border);
    border-radius: 6px;
    background: var(--card);
    color: var(--text);
    font-size: 13px;
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
