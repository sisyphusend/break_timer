<script>
  import { invoke } from "@tauri-apps/api/core";
  import { onMount, onDestroy } from "svelte";

  let remaining = $state(0);
  let timerId = null;

  // 加载本次休息秒数,开始倒计时
  onMount(async () => {
    try {
      remaining = await invoke("get_break_seconds");
    } catch {
      remaining = 20;
    }
    startTick();
  });

  onDestroy(() => {
    if (timerId) clearInterval(timerId);
  });

  function startTick() {
    if (timerId) clearInterval(timerId);
    timerId = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        remaining = 0;
        stop();
      }
    }, 1000);
  }

  // 倒计时结束 / 用户跳过: 通知后端关闭窗口
  async function stop() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    try {
      await invoke("close_overlay");
    } catch (e) {
      console.error(e);
    }
  }

  function skip() {
    remaining = 0;
    stop();
  }
</script>

<div class="frosted-layer"></div>
<main class="overlay">
  <div class="badge">休息时间</div>
  <h1 class="title">该休息一下啦</h1>
  <p class="subtitle">看看窗外，活动一下肩颈，深呼吸几次</p>
  <div class="countdown">{remaining}</div>
  <div class="actions">
    <button class="btn" onclick={skip}>跳过本次</button>
  </div>
</main>

<style>
  /* html/body 样式需要全局生效(无法 scope) */
  :global(html), :global(body) {
    width: 100%;
    height: 100%;
    overflow: hidden;
    font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
    color: white;
    user-select: none;
  }

  /* 全屏毛玻璃遮罩层 */
  .frosted-layer {
    position: fixed;
    inset: 0;
    background: rgba(15, 17, 21, 0.45);
    backdrop-filter: blur(40px) saturate(180%);
    -webkit-backdrop-filter: blur(40px) saturate(180%);
    z-index: 1;
  }

  .overlay {
    position: relative;
    z-index: 2;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 40px;
  }

  .badge {
    display: inline-block;
    padding: 6px 16px;
    background: rgba(255, 255, 255, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 999px;
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.05em;
    margin-bottom: 24px;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }

  .title {
    font-size: 64px;
    font-weight: 700;
    margin: 0 0 16px;
    text-shadow: 0 2px 20px rgba(0, 0, 0, 0.3);
  }

  .subtitle {
    font-size: 20px;
    font-weight: 400;
    opacity: 0.85;
    margin: 0 0 48px;
    max-width: 600px;
    text-shadow: 0 1px 8px rgba(0, 0, 0, 0.3);
  }

  .countdown {
    font-size: 160px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    margin-bottom: 48px;
    text-shadow: 0 4px 40px rgba(0, 0, 0, 0.4);
    font-feature-settings: "tnum";
  }

  .actions { margin-top: 16px; }

  .btn {
    padding: 12px 32px;
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 8px;
    color: white;
    font-size: 15px;
    cursor: pointer;
    transition: all 0.2s;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }

  .btn:hover {
    background: rgba(255, 255, 255, 0.2);
    border-color: rgba(255, 255, 255, 0.5);
  }
</style>
