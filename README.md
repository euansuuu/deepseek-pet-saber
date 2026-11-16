# dsh-plugin-saber-pet

在 DeepSeek Harness 窗口内显示的 Saber 桌宠插件（cordis bundle）。

## 功能

- **9 种精灵动画**：喝茶待机、向左移动、向右移动、轻跳、召唤问候、异常求助、思考检索、挥剑执行、举剑庆祝（`animation.json` v1 动作编排原样保留）
- **会话联动**：Agent 工作时挥剑执行，等待输入或确认时思考检索，回合结束举剑庆祝
- **交互**：悬停轻跳、拖拽移动（按拖动方向播放跑步动作，位置保存在浏览器本地）、单击或双击弹出问候气泡，滚轮或气泡按钮调整大小（0.6–1.75 倍，自动记忆）
- **界面文案**分中英文，跟随 Harness 语言设置；样式通过 Shadow DOM 隔离，不干扰宿主；出现异常时降级为纯待机动画，不影响主界面

## 安装

### 方式一：npm 包名

1. 侧栏 → **插件** → **添加插件** 旁的箭头 → **安装第三方插件**
2. 输入包名：
   ```
   dsh-plugin-saber-pet
   ```
   安装源可选 npm 官方源或「中国大陆镜像源」（npmmirror 已同步本包）
3. **安装** → **立即启用** → 刷新页面，Saber 出现在窗口左下角

若安装端提示新发布版本风险（供应链策略对刚上架版本的检查），确认后即可正常安装。

### 方式二：Git 地址

1. 侧栏 → **插件** → **添加插件** 旁的箭头 → **安装第三方插件**
2. 输入仓库地址：
   ```
   https://github.com/euansuuu/deepseek-pet-saber
   ```
3. **安装** → **立即启用** → 刷新页面，Saber 出现在窗口左下角

### 方式三：本地目录（开发者）

克隆本仓库，在「安装第三方插件」中输入克隆路径。本地目录安装以链接方式接入，修改代码后刷新页面即可生效。

### 方式四：插件市场索引（如已部署）

插件页 → **发现** 标签 → 选择索引源 → 搜索 **Saber** → 安装。

## 交互与状态

以下 GIF 按 `animation.json` 的帧序列与时长，从精灵表逐帧导出（透明背景），即插件实际播放的画面。

| 动作 | 状态名 | 插件内触发 | 演示 |
| --- | --- | --- | --- |
| 召唤问候 | `waving` | 双击宠物 / 问候气泡 | <img src="docs/images/waving.gif" width="110"> |
| 喝茶待机 | `idle` | 默认循环 | <img src="docs/images/idle.gif" width="110"> |
| 挥剑执行 | `running` | Agent 会话运行中（`useSessions`） | <img src="docs/images/running.gif" width="110"> |
| 思考检索 | `waiting` | 会话等待输入/确认 | <img src="docs/images/waiting.gif" width="110"> |
| 举剑庆祝 | `review` | 工作转为空闲时 | <img src="docs/images/review.gif" width="110"> |
| 向左移动 | `running-left` | 按住拖动，向左拖 | <img src="docs/images/running-left.gif" width="110"> |
| 向右移动 | `running-right` | 按住拖动，向右拖 | <img src="docs/images/running-right.gif" width="110"> |
| 轻跳 | `jumping` | 鼠标悬停 | <img src="docs/images/jumping.gif" width="110"> |

异常求助 `failed` 已保留在素材中，v1 暂无触发来源（见下节），演示见 [docs/images/failed.gif](docs/images/failed.gif)。

## 会话状态来源（v1 说明）

工作/等待状态读取 `useSessions` / `useSessionStatus` 槽位钩子，字段读取保持防御式：
`status.running === true` 判为工作中，`waiting/pending/pendingInteraction` 判为等待中。
庆祝动作由「工作转为空闲」触发；客户端区分不了正常完成、取消和失败，所以统一按完成庆祝。
需要精确的完成原因（`turn/end` 的 `reason.kind`）时，要加宿主 typert 远程桥，计划在 v2 实现。

## 兼容性

- 按 DSH `0.2.1-rc.3` 开发，槽位接法与 `dsh-plugin-whale-pet` 0.2.9 相同
- DSH 升级可能改变槽位契约；出现异常时插件自动降级为纯待机动画，不影响主界面

## 许可

MIT —— 见 [LICENSE](LICENSE) 与 [NOTICE.md](NOTICE.md)。
