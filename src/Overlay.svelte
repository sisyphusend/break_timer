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

  <!--
    SVG 插画:远山与日落
    - 3 层山脉从近到远退入地平线,空间纵深 = "眺望"
    - 太阳落在远山之间,把视线焦点引向远方
    - 2 只飞鸟剪影,画面呼吸感
    - 渐变从顶部的夜蓝过渡到地平线暖橘
  -->
  <div class="illustration">
    <svg
      class="illustration-svg"
      viewBox="0 0 800 320"
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="远山日落,提示望向远方"
    >
      <defs>
        <!-- 天空:夜蓝 → 中调 → 暖橘 -->
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2D3C58" />
          <stop offset="50%" stop-color="#788298" />
          <stop offset="100%" stop-color="#E8B89A" />
        </linearGradient>

        <!-- 太阳柔光晕 -->
        <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#FFE9C8" stop-opacity="0.7" />
          <stop offset="55%" stop-color="#FFD9A0" stop-opacity="0.18" />
          <stop offset="100%" stop-color="#FFD9A0" stop-opacity="0" />
        </radialGradient>

        <!-- 远山前的暖色薄雾 -->
        <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#788298" stop-opacity="0" />
          <stop offset="100%" stop-color="#E8B89A" stop-opacity="0.6" />
        </linearGradient>
      </defs>

      <!-- 天空背景 -->
      <rect width="800" height="320" fill="url(#sky)" />

      <!-- 太阳光晕 -->
      <circle cx="400" cy="195" r="170" fill="url(#sunGlow)" />

      <!-- 太阳本体 -->
      <circle cx="400" cy="195" r="32" fill="#FFEDC8" />

      <!-- 飞鸟 — 两组双弧曲线 -->
      <path
        d="M 575 75 q 7 -7 14 0 t 14 0"
        fill="none" stroke="#1F2535" stroke-width="2"
        stroke-linecap="round" opacity="0.65"
      />
      <path
        d="M 640 100 q 5 -5 10 0 t 10 0"
        fill="none" stroke="#1F2535" stroke-width="1.5"
        stroke-linecap="round" opacity="0.5"
      />

      <!-- 远山(最淡、最小,在太阳之后) -->
      <path
        d="M 0 210 L 65 192 L 130 215 L 195 188 L 260 210
           L 325 185 L 400 205 L 475 182 L 550 202
           L 625 185 L 700 205 L 775 195 L 800 200
           L 800 245 L 0 245 Z"
        fill="#7B89A0" opacity="0.7"
      />

      <!-- 远山的薄雾,让"天空 → 山"过渡更柔和 -->
      <rect x="0" y="190" width="800" height="55" fill="url(#haze)" opacity="0.5" />

      <!-- 中山 -->
      <path
        d="M 0 245 L 90 220 L 175 248 L 260 225 L 345 250
           L 430 228 L 515 252 L 600 232 L 685 254
           L 770 238 L 800 245
           L 800 285 L 0 285 Z"
        fill="#54617A"
      />

      <!-- 前景山(最深、最近) -->
      <path
        d="M 0 280 L 120 265 L 240 290 L 360 270 L 480 295
           L 600 275 L 720 295 L 800 285
           L 800 320 L 0 320 Z"
        fill="#2F374A"
      />
    </svg>
  </div>

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

  .illustration {
    width: 100%;
    max-width: 560px;
    margin: 0 auto 48px;
    border-radius: 14px;
    overflow: hidden;
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.35),
      0 0 0 1px rgba(255, 255, 255, 0.06);
  }

  .illustration-svg {
    width: 100%;
    height: auto;
    display: block;
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
