// cron-builder.js
// 可视化 6 位 cron 表达式构造器,纯前端模块,不依赖 Tauri。
// 6 位格式: 秒 分 时 日 月 周

const PRESETS = [
  { id: '30min',     label: '每 30 分钟一次',              cron: '0 */30 * * * * *',  preview: '每 30 分钟一次' },
  { id: '1hour',     label: '每 1 小时一次',               cron: '0 0 */1 * * * *',   preview: '每 1 小时一次' },
  { id: 'daily9',    label: '每天 09:00',                  cron: '0 0 9 * * * *',     preview: '每天 09:00' },
  { id: 'workhours', label: '工作日 09:00 / 13:00 / 18:00', cron: '0 0 9,13,18 * * 1-5', preview: '工作日 09:00 / 13:00 / 18:00' },
];

// 用户可自定义的 5 个字段(秒固定为 0)
const FIELD_DEFS = [
  { key: 'minute',  label: '分', min: 0, max: 59, hint: '0-59' },
  { key: 'hour',    label: '时', min: 0, max: 23, hint: '0-23' },
  { key: 'day',     label: '日', min: 1, max: 31, hint: '1-31' },
  { key: 'month',   label: '月', min: 1, max: 12, hint: '1-12' },
  { key: 'weekday', label: '周', min: 0, max: 6,  hint: '0(周日)-6' },
];

// ============================================================
// 工具
// ============================================================

function matchPreset(cron) {
  return PRESETS.find((p) => p.cron === cron) || null;
}

// 把单个字段解析成 { mode, value }
//   "*"               -> { mode: 'any',      value: '' }
//   "*/15"            -> { mode: 'step',     value: '15' }
//   "0,30" / "9-17" / "9,13,18" / "1-5"
//                     -> { mode: 'specific', value: 原字符串 }
// 其它异常 -> 默认 any
function parseField(field) {
  if (!field || field === '*') return { mode: 'any', value: '' };
  if (field.startsWith('*/')) {
    const v = field.slice(2);
    return { mode: 'step', value: /^\d+$/.test(v) ? v : '1' };
  }
  if (/^[\d,\-]+$/.test(field)) {
    return { mode: 'specific', value: field };
  }
  return { mode: 'any', value: '' };
}

// 用 { mode, value } 反向生成字段字符串
function buildField(state, def) {
  if (state.mode === 'any') return '*';
  if (state.mode === 'specific') {
    const v = (state.value || '').trim();
    return v ? v : String(def.min);
  }
  if (state.mode === 'step') {
    const n = parseInt(state.value, 10);
    return Number.isFinite(n) && n > 0 ? `*/${n}` : '*';
  }
  return '*';
}

// 人话预览: 优先匹配预设,否则简单拼装
function buildPreview(cron) {
  const preset = matchPreset(cron);
  if (preset) return preset.preview;

  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 6) return '自定义表达式';
  const [, m, h, d, mo, w] = parts;

  const desc = [];
  if (m.startsWith('*/')) desc.push(`每 ${m.slice(2)} 分钟`);
  else if (m !== '*') desc.push(`分 = ${m}`);
  if (h.startsWith('*/')) desc.push(`每 ${h.slice(2)} 小时`);
  else if (h !== '*') desc.push(`时 = ${h}`);
  if (d !== '*') desc.push(`日 = ${d}`);
  if (mo !== '*') desc.push(`月 = ${mo}`);
  if (w !== '*') desc.push(`周 = ${w}`);
  if (desc.length === 0) return '每分钟';
  return desc.join(' / ');
}

// ============================================================
// CronBuilder
// ============================================================

export class CronBuilder {
  constructor(root, initialCron) {
    this.root = root;
    this.cron = initialCron || PRESETS[0].cron;
    this.onChangeCb = null;
    this._render();
    this._bind();
    this._applyInitial();
  }

  // 注册值变化回调(cron, preview)
  onChange(cb) {
    this.onChangeCb = cb;
  }

  // 当前 cron 字符串
  getValue() {
    return this.cron;
  }

  // 渲染骨架 HTML
  _render() {
    const presetsHtml = PRESETS.map(
      (p) => `
      <label class="preset">
        <input type="radio" name="cron-preset" value="${p.id}" />
        <span>${p.label}</span>
      </label>`
    ).join('');

    const fieldsHtml = FIELD_DEFS.map(
      (def) => `
      <div class="cron-field" data-key="${def.key}" data-min="${def.min}" data-max="${def.max}">
        <span class="cron-field-label">${def.label}</span>
        <select class="cron-field-mode">
          <option value="any">任意</option>
          <option value="specific">指定</option>
          <option value="step">每隔</option>
        </select>
        <input class="cron-field-value" type="text" placeholder="${def.hint}" />
      </div>`
    ).join('');

    this.root.innerHTML = `
      <div class="preset-list">${presetsHtml}
        <label class="preset">
          <input type="radio" name="cron-preset" value="custom" />
          <span>自定义...</span>
        </label>
      </div>
      <div id="cron-custom" hidden>${fieldsHtml}</div>
      <div class="cron-footer">
        <code id="cron-output"></code>
        <span id="cron-preview" class="cron-preview"></span>
      </div>
    `;
  }

  _bind() {
    // 预设单选
    this.root.querySelectorAll('input[name="cron-preset"]').forEach((radio) => {
      radio.addEventListener('change', () => this._onPresetChange());
    });

    // 自定义字段
    this.root.querySelectorAll('.cron-field').forEach((row) => {
      const def = FIELD_DEFS.find((d) => d.key === row.dataset.key);
      const modeSel = row.querySelector('.cron-field-mode');
      const valInput = row.querySelector('.cron-field-value');

      modeSel.addEventListener('change', () => {
        const showValue = modeSel.value !== 'any';
        valInput.hidden = !showValue;
        if (showValue && !valInput.value) {
          valInput.value = modeSel.value === 'specific' ? String(def.min) : '1';
        }
        this._onCustomChange();
      });

      valInput.addEventListener('input', () => this._onCustomChange());
    });
  }

  // 根据 initialCron 选中预设或回填自定义字段
  _applyInitial() {
    const preset = matchPreset(this.cron);
    if (preset) {
      this.root.querySelector(`input[value="${preset.id}"]`).checked = true;
      this._hideCustom();
    } else {
      this.root.querySelector('input[value="custom"]').checked = true;
      this._showCustom();
      const parts = this.cron.trim().split(/\s+/);
      // parts = [sec, min, hour, day, month, weekday]
      FIELD_DEFS.forEach((def, idx) => {
        const row = this.root.querySelector(`[data-key="${def.key}"]`);
        const modeSel = row.querySelector('.cron-field-mode');
        const valInput = row.querySelector('.cron-field-value');
        const parsed = parseField(parts[idx + 1] || '*');
        modeSel.value = parsed.mode;
        valInput.value = parsed.value;
        valInput.hidden = parsed.mode === 'any';
      });
    }
    this._emit();
  }

  _onPresetChange() {
    const presetId = this.root.querySelector(
      'input[name="cron-preset"]:checked'
    ).value;

    if (presetId === 'custom') {
      this._showCustom();
      // 给一个合理的初始状态
      this.root.querySelectorAll('.cron-field').forEach((row) => {
        const modeSel = row.querySelector('.cron-field-mode');
        const valInput = row.querySelector('.cron-field-value');
        modeSel.value = 'any';
        valInput.value = '';
        valInput.hidden = true;
      });
      this._onCustomChange();
      return;
    }

    this._hideCustom();
    const preset = PRESETS.find((p) => p.id === presetId);
    this.cron = preset.cron;
    this._emit();
  }

  _onCustomChange() {
    const state = {};
    this.root.querySelectorAll('.cron-field').forEach((row) => {
      state[row.dataset.key] = {
        mode: row.querySelector('.cron-field-mode').value,
        value: row.querySelector('.cron-field-value').value,
      };
    });

    // 第二个字段是 minute,顺序对应 FIELD_DEFS
    const parts = FIELD_DEFS.map((def) => buildField(state[def.key], def));
    // 秒固定为 0(整点触发)
    this.cron = `0 ${parts.join(' ')}`;
    this._emit();
  }

  _showCustom() {
    this.root.querySelector('#cron-custom').hidden = false;
  }

  _hideCustom() {
    this.root.querySelector('#cron-custom').hidden = true;
  }

  // 更新底部预览 + 触发回调
  _emit() {
    const preset = matchPreset(this.cron);
    const preview = preset ? preset.preview : buildPreview(this.cron);
    this.root.querySelector('#cron-output').textContent = this.cron;
    this.root.querySelector('#cron-preview').textContent = preview;
    if (this.onChangeCb) this.onChangeCb(this.cron, preview);
  }
}
