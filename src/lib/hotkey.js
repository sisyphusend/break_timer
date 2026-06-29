// src/lib/hotkey.js
// 全局快捷键的捕获 + 匹配工具
// 统一的快捷键字符串表示法: "Ctrl+Shift+Alt+Q"、"Escape"、"F2" 等。

const MODIFIER_KEYS = ["Control", "Shift", "Alt", "Meta"];
const MODIFIER_PREFIXES = ["Ctrl", "Shift", "Alt", "Meta"];

/**
 * 从 KeyboardEvent 提取组合键字符串。
 * 返回 null 表示只是按下了修饰键(还没决定主键,继续等)。
 */
export function formatCombo(event) {
  const parts = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.shiftKey) parts.push("Shift");
  if (event.altKey) parts.push("Alt");
  if (event.metaKey) parts.push("Meta");

  // 只按了修饰键,不算
  if (MODIFIER_KEYS.includes(event.key)) return null;

  // 主键:字母统一大写,其它(F1/Escape/Enter 等)原样保留
  const mainKey = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  parts.push(mainKey);

  return parts.join("+");
}

/**
 * 判断当前 KeyboardEvent 是否匹配给定的组合键字符串
 */
export function matches(event, comboString) {
  if (!comboString) return false;
  const want = comboString.split("+");
  const wantCtrl = want.includes("Ctrl");
  const wantShift = want.includes("Shift");
  const wantAlt = want.includes("Alt");
  const wantMeta = want.includes("Meta");
  const mainKey = want[want.length - 1];

  if (event.ctrlKey !== wantCtrl) return false;
  if (event.shiftKey !== wantShift) return false;
  if (event.altKey !== wantAlt) return false;
  if (event.metaKey !== wantMeta) return false;

  // 主键比较(不区分大小写字母)
  return (
    event.key === mainKey ||
    (mainKey.length === 1 &&
      event.key.length === 1 &&
      event.key.toUpperCase() === mainKey.toUpperCase())
  );
}
