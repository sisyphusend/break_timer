// 遮罩窗口入口 - 启动时挂载 Overlay.svelte 到 #app
import { mount } from "svelte";
import Overlay from "./Overlay.svelte";

mount(Overlay, { target: document.getElementById("app") });
