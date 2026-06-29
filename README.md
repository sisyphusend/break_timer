# BreakTimer · 休息提醒

一个基于 **Tauri 2** 的 Windows 桌面休息提醒应用。
到点全屏笼罩毛玻璃遮罩，提示休息并倒计时。

## 功能

- 两种调度方式：
  - **固定间隔**：每隔 N 分钟休息一次
  - **Cron 表达式**：6 位 cron（带秒），灵活定制
- 自定义休息时长（秒）
- 全屏毛玻璃效果（`backdrop-filter: blur`）
- 大字号倒计时，可手动跳过
- 配置自动持久化到本地

## 截图（文字版）

**主窗口**：简洁的设置面板，选择模式、设置间隔、调整休息秒数。

**休息遮罩**：全屏半透明深色层 + 40px 模糊，顶部居中显示"该休息一下啦"和大字号倒计时。

## 技术栈

- **Tauri 2**（Rust 后端 + Web 前端）
- **前端**：原生 HTML / CSS / JS（无框架，轻量）
- **后端**：`tokio` 异步运行时 + `cron` crate + `tauri-plugin-store` 持久化
- **调度**：interval 模式用 `tokio::time::interval`，cron 模式用 `cron::Schedule`

## 项目结构

```
break_timer/
├── index.html              # 主窗口
├── src/
│   ├── main.js             # 主窗口逻辑
│   ├── style.css
│   ├── overlay.html        # 全屏遮罩
│   ├── overlay.js
│   └── overlay.css
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json
│   ├── icons/
│   └── src/
│       ├── main.rs
│       └── lib.rs          # 配置 / 调度 / 遮罩窗口
└── package.json
```

## 开发与运行

### 前置要求

- Node.js ≥ 18
- pnpm / npm / yarn（任选）
- Rust toolchain（`rustup`）
- Windows：Microsoft C++ Build Tools + WebView2 Runtime（Win11 自带）

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
pnpm tauri dev
```

### 打包发布

```bash
pnpm tauri build
```

产物在 `src-tauri/target/release/bundle/` 下。

## 使用

1. 启动应用，**主窗口**默认显示设置。
2. 选择调度方式：
   - **固定间隔**：填入分钟数（默认 30 分钟）。
   - **Cron 表达式**：6 位格式 `秒 分 时 日 月 周`，例如 `0 0 */30 * * * *` 表示每 30 分钟一次。
3. 设置休息秒数（默认 20 秒）。
4. 点击 **启动**，状态变为"运行中"并显示下次休息时间。
5. 到点弹出全屏毛玻璃遮罩，**倒计时**走完后自动关闭，也可点击"跳过本次"。
6. 点击 **停止** 取消调度。
7. 点击 **立即测试** 可立刻弹一次遮罩，用于验证效果。

## Cron 表达式格式

6 位（带秒），从左到右依次是：

| 字段 | 取值范围 | 说明 |
|------|----------|------|
| 秒   | 0-59     | |
| 分   | 0-59     | |
| 时   | 0-23     | |
| 日   | 1-31     | |
| 月   | 1-12     | |
| 周   | 0-6      | 0 = 周日 |

常用示例：
- `0 0 */30 * * * *` — 每 30 分钟一次
- `0 0 9-18/2 * * *` — 9 点到 18 点，每 2 小时一次
- `0 0 9 * * 1-5 *` — 工作日早上 9 点
- `0 30 10,15 * * *` — 每天 10:30 和 15:30

## 配置存储

应用配置通过 `tauri-plugin-store` 持久化到：
```
%APPDATA%\com.breaktimer.app\config.json
```

修改设置后点击"启动"会自动保存。
