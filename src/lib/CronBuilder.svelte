<script>
  // Cron 表达式可视化构造器 (Svelte 5)
  // 6 位格式: 秒 分 时 日 月 周

  // 通过 $bindable 让父组件双向绑定 cron 值
  let {
    initialCron = "0 */30 * * * * *",
    cron = $bindable(initialCron),
  } = $props();

  // 常用预设 (一键选择,生成标准 6 位表达式)
  const PRESETS = [
    { id: "30min",     label: "每 30 分钟一次",               cron: "0 */30 * * * * *" },
    { id: "1hour",     label: "每 1 小时一次",                cron: "0 0 */1 * * * *" },
    { id: "daily9",    label: "每天 09:00",                   cron: "0 0 9 * * * *" },
    { id: "workhours", label: "工作日 09:00 / 13:00 / 18:00", cron: "0 0 9,13,18 * * 1-5" },
  ];

  // 用户可自定义的 5 个字段 (秒固定为 0)
  const FIELD_DEFS = [
    { key: "minute",  label: "分", min: 0, max: 59, hint: "0-59" },
    { key: "hour",    label: "时", min: 0, max: 23, hint: "0-23" },
    { key: "day",     label: "日", min: 1, max: 31, hint: "1-31" },
    { key: "month",   label: "月", min: 1, max: 12, hint: "1-12" },
    { key: "weekday", label: "周", min: 0, max: 6,  hint: "0(周日)-6" },
  ];

  // ============================================================
  // 工具函数
  // ============================================================

  function matchPreset(value) {
    return PRESETS.find((p) => p.cron === value) || null;
  }

  // 解析单个字段 -> { mode, value }
  function parseField(field) {
    if (!field || field === "*") return { mode: "any", value: "" };
    if (field.startsWith("*/")) {
      const v = field.slice(2);
      return { mode: "step", value: /^\d+$/.test(v) ? v : "1" };
    }
    if (/^[\d,\-]+$/.test(field)) {
      return { mode: "specific", value: field };
    }
    return { mode: "any", value: "" };
  }

  // 用 { mode, value } 反向生成字段字符串
  function buildField(state, def) {
    if (state.mode === "any") return "*";
    if (state.mode === "specific") {
      const v = (state.value || "").trim();
      return v ? v : String(def.min);
    }
    if (state.mode === "step") {
      const n = parseInt(state.value, 10);
      return Number.isFinite(n) && n > 0 ? `*/${n}` : "*";
    }
    return "*";
  }

  // 人话预览
  function buildPreview(value) {
    const preset = matchPreset(value);
    if (preset) return preset.label;

    const parts = value.trim().split(/\s+/);
    if (parts.length !== 6) return "自定义表达式";
    const [, m, h, d, mo, w] = parts;

    const desc = [];
    if (m.startsWith("*/")) desc.push(`每 ${m.slice(2)} 分钟`);
    else if (m !== "*") desc.push(`分 = ${m}`);
    if (h.startsWith("*/")) desc.push(`每 ${h.slice(2)} 小时`);
    else if (h !== "*") desc.push(`时 = ${h}`);
    if (d !== "*") desc.push(`日 = ${d}`);
    if (mo !== "*") desc.push(`月 = ${mo}`);
    if (w !== "*") desc.push(`周 = ${w}`);
    if (desc.length === 0) return "每分钟";
    return desc.join(" / ");
  }

  // 从 cron 字符串反向生成 customFields 初始值
  function parseCustomFields(value) {
    const parts = value.trim().split(/\s+/);
    const out = {};
    FIELD_DEFS.forEach((def, idx) => {
      out[def.key] = parseField(parts[idx + 1] || "*");
    });
    return out;
  }

  // ============================================================
  // 状态
  // ============================================================

  const initialPreset = matchPreset(cron);
  let presetId = $state(initialPreset ? initialPreset.id : "custom");
  let customFields = $state(parseCustomFields(cron));

  // 派生: 人话预览随 cron 自动更新
  let preview = $derived(buildPreview(cron));

  // 派生: 是否展示自定义字段面板
  let showCustom = $derived(presetId === "custom");

  // ============================================================
  // 事件处理
  // ============================================================

  function onPresetChange(event) {
    const id = event.target.value;
    presetId = id;
    if (id === "custom") {
      // 切到自定义: 用当前 cron 反向填字段
      customFields = parseCustomFields(cron);
      rebuildCron();
    } else {
      const p = PRESETS.find((p) => p.id === id);
      if (p) cron = p.cron;
    }
  }

  function onFieldModeChange(key) {
    return (event) => {
      const mode = event.target.value;
      const def = FIELD_DEFS.find((d) => d.key === key);
      const current = customFields[key];
      const newValue =
        mode !== "any" && !current.value
          ? mode === "specific"
            ? String(def.min)
            : "1"
          : current.value;
      customFields[key] = { mode, value: newValue };
      rebuildCron();
    };
  }

  function onFieldValueChange(key) {
    return (event) => {
      customFields[key] = { ...customFields[key], value: event.target.value };
      rebuildCron();
    };
  }

  function rebuildCron() {
    const parts = FIELD_DEFS.map((def) => buildField(customFields[def.key], def));
    // 秒固定为 0 (整点触发)
    cron = `0 ${parts.join(" ")}`;
  }
</script>

<div class="cron-builder">
  <div class="preset-list">
    {#each PRESETS as p (p.id)}
      <label class="preset">
        <input
          type="radio"
          name="cron-preset"
          value={p.id}
          bind:group={presetId}
          onchange={onPresetChange}
        />
        <span>{p.label}</span>
      </label>
    {/each}
    <label class="preset">
      <input
        type="radio"
        name="cron-preset"
        value="custom"
        bind:group={presetId}
        onchange={onPresetChange}
      />
      <span>自定义...</span>
    </label>
  </div>

  {#if showCustom}
    <div class="cron-custom">
      {#each FIELD_DEFS as def (def.key)}
        <div class="cron-field">
          <span class="cron-field-label">{def.label}</span>
          <select
            class="cron-field-mode"
            value={customFields[def.key].mode}
            onchange={onFieldModeChange(def.key)}
          >
            <option value="any">任意</option>
            <option value="specific">指定</option>
            <option value="step">每隔</option>
          </select>
          <input
            class="cron-field-value"
            type="text"
            placeholder={def.hint}
            value={customFields[def.key].value}
            oninput={onFieldValueChange(def.key)}
            disabled={customFields[def.key].mode === "any"}
          />
        </div>
      {/each}
    </div>
  {/if}

  <div class="cron-footer">
    <code>{cron}</code>
    <span class="cron-preview">{preview}</span>
  </div>
</div>

<style>
  .cron-builder {
    width: 100%;
  }

  .preset-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
  }

  .preset {
    display: flex;
    align-items: center;
    padding: 10px 12px;
    background: #0b0d12;
    border: 1px solid var(--card-border);
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.15s;
    user-select: none;
  }

  .preset:hover { border-color: #3a4150; }
  .preset input { margin-right: 10px; accent-color: var(--primary); }
  .preset:has(input:checked) {
    background: rgba(79, 140, 255, 0.1);
    border-color: var(--primary);
    color: var(--primary);
  }

  .cron-custom {
    margin-top: 4px;
    padding: 14px;
    background: #0b0d12;
    border: 1px solid var(--card-border);
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .cron-field {
    display: grid;
    grid-template-columns: 36px 110px 1fr;
    align-items: center;
    gap: 10px;
  }

  .cron-field-label {
    font-size: 13px;
    color: var(--text-dim);
    font-weight: 500;
    text-align: center;
  }

  .cron-field-mode,
  .cron-field-value {
    padding: 6px 8px;
    background: #1a1d24;
    border: 1px solid var(--card-border);
    border-radius: 4px;
    color: var(--text);
    font-size: 13px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s;
  }

  .cron-field-mode:focus,
  .cron-field-value:focus { border-color: var(--primary); }

  .cron-field-value { font-family: "Consolas", "Monaco", monospace; }

  .cron-field-value:disabled { opacity: 0.4; cursor: not-allowed; }

  .cron-footer {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--card-border);
    font-size: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .cron-footer code {
    font-family: "Consolas", "Monaco", monospace;
    background: #0b0d12;
    padding: 6px 10px;
    border-radius: 4px;
    color: var(--primary);
    font-size: 13px;
    word-break: break-all;
  }

  .cron-preview { color: var(--text-dim); font-size: 13px; }
</style>
