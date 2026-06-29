// 防止 Windows 额外控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    break_timer_lib::run()
}
