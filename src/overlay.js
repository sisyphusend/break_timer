import { invoke } from "@tauri-apps/api/core";

let remaining = 0;
let timerId = null;

const countdownEl = document.getElementById("countdown");
const skipBtn = document.getElementById("skip-btn");

// 从后端拿到本次休息秒数
async function init() {
  try {
    remaining = await invoke("get_break_seconds");
  } catch {
    remaining = 20;
  }
  render();
  startTick();
}

function render() {
  countdownEl.textContent = String(remaining);
}

function startTick() {
  if (timerId) clearInterval(timerId);
  timerId = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      remaining = 0;
      render();
      stop();
      return;
    }
    render();
  }, 1000);
}

// 倒计时结束或被跳过：通知后端关闭窗口
async function stop() {
  if (timerId) clearInterval(timerId);
  try {
    await invoke("close_overlay");
  } catch (e) {
    console.error(e);
  }
}

skipBtn.addEventListener("click", () => {
  remaining = 0;
  stop();
});

init();
