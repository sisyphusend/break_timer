// 主窗口入口 - 启动时挂载 App.svelte 到 #app
import { mount } from "svelte";
import App from "./App.svelte";
import "./global.css";

mount(App, { target: document.getElementById("app") });
