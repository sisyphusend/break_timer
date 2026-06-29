use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Utc};
use cron::Schedule;
use serde::{Deserialize, Serialize};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_store::StoreExt;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

// ============================================================
// 配置
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    /// 调度模式: "interval" 或 "cron"
    #[serde(default = "default_mode")]
    pub mode: String,
    /// interval 模式下的分钟数
    #[serde(default = "default_interval")]
    pub interval_minutes: u32,
    /// cron 表达式(6 位,带秒)
    #[serde(default = "default_cron")]
    pub cron_expression: String,
    /// 休息时长(秒)
    #[serde(default = "default_break")]
    pub break_seconds: u32,
    /// 是否开机自启动
    #[serde(default = "default_autostart")]
    pub autostart: bool,
    /// 取消休息的全局快捷键(空 = 不启用)
    #[serde(default = "default_cancel_hotkey")]
    pub cancel_hotkey: String,
    /// 遮罩背景颜色(hex,#RRGGBB)
    #[serde(default = "default_bg_color")]
    pub background_color: String,
    /// 遮罩背景透明度(0-100)
    #[serde(default = "default_bg_opacity")]
    pub background_opacity: u32,
}

fn default_mode() -> String { "interval".to_string() }
fn default_interval() -> u32 { 30 }
fn default_cron() -> String { "0 0 */30 * * * *".to_string() }
fn default_break() -> u32 { 20 }
fn default_autostart() -> bool { false }
fn default_cancel_hotkey() -> String { "Escape".to_string() }
fn default_bg_color() -> String { "#0F1115".to_string() }
fn default_bg_opacity() -> u32 { 45 }

impl Default for Config {
    fn default() -> Self {
        Self {
            mode: default_mode(),
            interval_minutes: default_interval(),
            cron_expression: default_cron(),
            break_seconds: default_break(),
            autostart: default_autostart(),
            cancel_hotkey: default_cancel_hotkey(),
            background_color: default_bg_color(),
            background_opacity: default_bg_opacity(),
        }
    }
}

// ============================================================
// 状态
// ============================================================

#[derive(Default)]
pub struct SchedulerHandle {
    task: Option<JoinHandle<()>>,
}

#[derive(Default)]
pub struct AppState {
    pub config: Mutex<Config>,
    pub scheduler: Mutex<SchedulerHandle>,
    pub running: Mutex<bool>,
    pub next_break_at: Mutex<Option<DateTime<Utc>>>,
}

// ============================================================
// Tauri 命令
// ============================================================

#[tauri::command]
async fn get_config(state: State<'_, Arc<AppState>>) -> Result<Config, String> {
    let cfg = state.config.lock().await;
    Ok(cfg.clone())
}

#[tauri::command]
async fn save_config(
    config: Config,
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    validate_config(&config).map_err(|e| e.to_string())?;

    {
        let mut cfg = state.config.lock().await;
        *cfg = config.clone();
    }

    // 持久化
    let store = app
        .store("config.json")
        .map_err(|e| format!("store init failed: {e}"))?;
    store.set("config", serde_json::to_value(&config).map_err(|e| e.to_string())?);
    store.save().map_err(|e| format!("store save failed: {e}"))?;

    Ok(())
}

#[tauri::command]
async fn start_scheduler(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<SchedulerStatus, String> {
    // 如果已经在跑,先停掉
    {
        let mut handle = state.scheduler.lock().await;
        if let Some(t) = handle.task.take() {
            t.abort();
        }
    }

    let config = state.config.lock().await.clone();
    validate_config(&config).map_err(|e| e.to_string())?;

    let app_handle = app.clone();
    let state_arc: Arc<AppState> = (*state).clone();

    // 启动调度任务
    let task = tokio::spawn(async move {
        run_scheduler(app_handle, state_arc, config).await;
    });

    {
        let mut handle = state.scheduler.lock().await;
        handle.task = Some(task);
    }
    {
        let mut running = state.running.lock().await;
        *running = true;
    }

    let status = get_status_inner(&state).await;
    Ok(status)
}

#[tauri::command]
async fn stop_scheduler(state: State<'_, Arc<AppState>>) -> Result<SchedulerStatus, String> {
    {
        let mut handle = state.scheduler.lock().await;
        if let Some(t) = handle.task.take() {
            t.abort();
        }
    }
    {
        let mut running = state.running.lock().await;
        *running = false;
    }
    {
        let mut next = state.next_break_at.lock().await;
        *next = None;
    }

    Ok(get_status_inner(&state).await)
}

#[tauri::command]
async fn get_status(state: State<'_, Arc<AppState>>) -> Result<SchedulerStatus, String> {
    Ok(get_status_inner(&state).await)
}

#[tauri::command]
async fn trigger_break(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    show_overlay(&app, &state).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn close_overlay(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("overlay") {
        let _ = win.close();
    }
    Ok(())
}

#[tauri::command]
async fn get_break_seconds(state: State<'_, Arc<AppState>>) -> Result<u32, String> {
    let cfg = state.config.lock().await;
    Ok(cfg.break_seconds)
}

/// 计算接下来 count 次的触发时间,RFC3339 字符串数组
/// 支持两种模式:
///   - "interval": 从现在开始每次 + interval_minutes
///   - "cron":     用 cron::Schedule::after 取未来 count 个时间
#[tauri::command]
async fn get_next_breaks(
    state: State<'_, Arc<AppState>>,
    count: u32,
) -> Result<Vec<String>, String> {
    let cfg = state.config.lock().await.clone();
    let n = count.clamp(1, 20) as usize;
    let mut out = Vec::with_capacity(n);

    match cfg.mode.as_str() {
        "interval" => {
            let secs = (cfg.interval_minutes as i64) * 60;
            let mut next = Utc::now() + chrono::Duration::seconds(secs);
            for _ in 0..n {
                out.push(next.to_rfc3339());
                next = next + chrono::Duration::seconds(secs);
            }
        }
        "cron" => {
            let schedule = Schedule::from_str(&cfg.cron_expression)
                .map_err(|e| format!("无效 cron 表达式: {e}"))?;
            let mut iter = schedule.after(&Utc::now());
            for _ in 0..n {
                if let Some(dt) = iter.next() {
                    out.push(dt.to_rfc3339());
                }
            }
        }
        _ => {}
    }
    Ok(out)
}

// ============================================================
// 开机自启动 (tauri-plugin-autostart)
// ============================================================

#[tauri::command]
async fn enable_autostart(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().enable().map_err(|e| e.to_string())
}

#[tauri::command]
async fn disable_autostart(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().disable().map_err(|e| e.to_string())
}

#[tauri::command]
async fn is_autostart_enabled(app: AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize)]
pub struct SchedulerStatus {
    pub running: bool,
    pub next_break_at: Option<DateTime<Utc>>,
}

async fn get_status_inner(state: &State<'_, Arc<AppState>>) -> SchedulerStatus {
    let running = *state.running.lock().await;
    let next = *state.next_break_at.lock().await;
    SchedulerStatus {
        running,
        next_break_at: next,
    }
}

// ============================================================
// 调度逻辑
// ============================================================

fn validate_config(config: &Config) -> Result<()> {
    if config.break_seconds < 1 {
        return Err(anyhow!("休息秒数必须大于 0"));
    }
    match config.mode.as_str() {
        "interval" => {
            if config.interval_minutes < 1 {
                return Err(anyhow!("间隔分钟数必须大于 0"));
            }
        }
        "cron" => {
            Schedule::from_str(&config.cron_expression)
                .with_context(|| format!("无效的 cron 表达式: {}", config.cron_expression))?;
        }
        other => return Err(anyhow!("未知的调度模式: {other}")),
    }
    Ok(())
}

async fn run_scheduler(app: AppHandle, state: Arc<AppState>, config: Config) {
    match config.mode.as_str() {
        "interval" => run_interval(app, state, config).await,
        "cron" => run_cron(app, state, config).await,
        _ => {}
    }
}

async fn run_interval(app: AppHandle, state: Arc<AppState>, config: Config) {
    let interval_secs = (config.interval_minutes as u64) * 60;
    let mut ticker = tokio::time::interval(Duration::from_secs(interval_secs));
    // 第一次 tick 立即触发,然后再等 interval
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

    loop {
        // 更新下次休息时间
        {
            let mut next = state.next_break_at.lock().await;
            *next = Some(Utc::now() + chrono::Duration::seconds(interval_secs as i64));
        }
        let _ = app.emit("scheduler-tick", ());

        ticker.tick().await;
        // 触发休息
        if let Err(e) = show_overlay(&app, &state).await {
            eprintln!("[scheduler] show overlay failed: {e}");
        }
    }
}

async fn run_cron(app: AppHandle, state: Arc<AppState>, config: Config) {
    let schedule = match Schedule::from_str(&config.cron_expression) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[scheduler] invalid cron: {e}");
            return;
        }
    };

    loop {
        // 下次触发时间
        let now = Utc::now();
        let next = schedule.after(&now).next();
        {
            let mut next_lock = state.next_break_at.lock().await;
            *next_lock = next;
        }
        let _ = app.emit("scheduler-tick", ());

        let Some(next_dt) = next else {
            // 没有下次了,退出
            let mut running = state.running.lock().await;
            *running = false;
            return;
        };

        // 等待到下次时间
        let wait = (next_dt - now).to_std().unwrap_or(Duration::from_secs(1));
        tokio::time::sleep(wait).await;

        // 触发休息
        if let Err(e) = show_overlay(&app, &state).await {
            eprintln!("[scheduler] show overlay failed: {e}");
        }
    }
}

// ============================================================
// 遮罩窗口
// ============================================================

async fn show_overlay(app: &AppHandle, _state: &Arc<AppState>) -> Result<()> {
    // 关闭已存在的
    if let Some(win) = app.get_webview_window("overlay") {
        let _ = win.close();
    }

    let url = WebviewUrl::App("overlay.html".into());

    // 创建时先不可见,等 webview 准备好第一帧(含 backdrop-filter)再显示,
    // 避免 transparent 窗口在透明期闪一下桌面 / 旧窗口
    let win = WebviewWindowBuilder::new(app, "overlay", url)
        .title("休息时间")
        .fullscreen(true)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(true)
        .visible(false)
        .build()
        .map_err(|e| anyhow!("create overlay window failed: {e}"))?;

    // 延迟 120ms 后再 show + set_focus,确保 backdrop-filter 已生效
    let win_for_delay = win.clone();
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(120)).await;
        let _ = win_for_delay.show();
        let _ = win_for_delay.set_focus();
    });

    Ok(())
}

// ============================================================
// 窗口管理辅助
// ============================================================

/// 显示并聚焦主窗口(用于托盘菜单 / 托盘左键 / 触发调度事件回调等场景)
fn show_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

// ============================================================
// 入口
// ============================================================

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(Arc::new(AppState::default()))
        .setup(|app| {
            // 从 store 加载配置
            let state: State<Arc<AppState>> = app.state();
            let store = app.store("config.json")?;
            if let Some(value) = store.get("config") {
                if let Ok(cfg) = serde_json::from_value::<Config>(value) {
                    let mut current = state.config.blocking_lock();
                    *current = cfg;
                }
            }

            // ---- 托盘菜单 ----
            // 只保留"设置"和"退出"两个高频操作
            let settings = MenuItemBuilder::with_id("settings", "设置")
                .enabled(true)
                .build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "退出")
                .enabled(true)
                .build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&settings)
                .item(&quit)
                .build()?;

            let icon = app
                .default_window_icon()
                .cloned()
                .ok_or_else(|| anyhow!("no default window icon configured"))?;

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .tooltip("BreakTimer · 休息提醒")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "settings" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            // ---- 主窗口关 X 改成隐藏到托盘 ----
            if let Some(win) = app.get_webview_window("main") {
                let w = win.clone();
                win.on_window_event(move |e| {
                    if let WindowEvent::CloseRequested { api, .. } = e {
                        api.prevent_close();
                        let _ = w.hide();
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            start_scheduler,
            stop_scheduler,
            get_status,
            trigger_break,
            close_overlay,
            get_break_seconds,
            get_next_breaks,
            enable_autostart,
            disable_autostart,
            is_autostart_enabled,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
