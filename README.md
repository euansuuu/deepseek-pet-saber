# dsh-plugin-saber-pet

栖息在 **DeepSeek Harness** 窗口里的 Saber 桌宠插件（cordis bundle）。
精灵动画引擎与角色素材迁移自 [codex-saber](https://github.com/euansuuu/codex-saber)（本人项目）。

> 本仓库即插件包本身（仓库根 = 包根），专为 DSH 开发，不包含其他内容。

## 功能

- **9 种精灵动画**：喝茶待机、挥剑执行、光屏检索、轻跳、召唤问候、向左/向右移动、举剑庆祝、异常求助（`animation.json` v1 编排原样保留）
- **随会话起舞**：读取 Harness 的会话目录/状态——Agent 工作时挥剑执行，等待输入时光屏检索，工作完成举剑庆祝
- **交互**：悬停轻跳、拖拽移动（按方向播放跑步动作，位置记忆在浏览器本地）、单击/双击召唤问候气泡
- **中英文案**跟随界面语言；Shadow DOM 隔离，不干扰宿主样式；任何异常自动降级为纯待机宠物

## 安装

### 方式一：插件市场索引（如已部署）

插件页 → **发现** 标签 → 选择索引源 → 搜索 **Saber** → 安装。

### 方式二：Git 地址

1. 侧栏 → **插件** → **添加插件** 旁的箭头 → **安装第三方插件**
2. 输入仓库地址：
   ```
   https://github.com/euansuuu/deepseek-pet-saber
   ```
3. **安装** → **立即启用** → 刷新页面，Saber 出现在窗口左下角

### 方式三：本地目录（开发者）

克隆本仓库后，在「安装第三方插件」中输入克隆路径即可；本地目录安装以链接方式接入，修改后刷新页面生效。

## 交互与状态

| codex-saber 原设计 | 插件内触发 |
| --- | --- |
| 召唤问候 `waving` | 双击宠物 / 问候气泡 |
| 喝茶待机 `idle` | 默认循环 |
| 挥剑执行 `running` | Agent 会话运行中（`useSessions`） |
| 思考检索 `waiting` | 会话等待输入/确认 |
| 举剑庆祝 `review` | 工作→空闲 跃迁 |
| 左/右移动 | 按住拖动，按方向切换 |
| 轻跳 `jumping` | 鼠标悬停 |

## 会话状态来源（v1 说明）

工作/等待状态读取 `useSessions` / `useSessionStatus` 槽位钩子，字段读取保持防御式：
`status.running === true` → 工作中；`waiting/pending/pendingInteraction` → 等待中。
「完成庆祝」由 工作→空闲 的状态跃迁触发，客户端无法区分「正常完成 / 取消 / 失败」，故统一庆祝；
如需精确的完成原因（`turn/end` 的 `reason.kind`），需加宿主 typert 远程桥，计划在 v2 实现。

## 开发

```powershell
# 修改 client.template.js 后重新构建 client.js
node tools/build-client.js

# 打包检查
pnpm pack
```

| 文件 | 职责 |
| --- | --- |
| `package.json` | bundle 清单：`dsh.bundle.patch` + `dsh.client`（platform/immediately/inject） |
| `cordis.patch.yml` | 只插入一行 `saber-pet` 插件，不覆盖任何官方组件 |
| `index.js` | Host 半（空实现，渲染全部在 Client） |
| `client.js` | Client 半：`shell.overlay` 槽位 + Shadow DOM 桌宠（构建产物，勿手改） |
| `client.template.js` | Client 源码（`__SPRITESHEET_DATA_URL__` 占位符） |
| `assets/` | 图标与精灵表（WebP） |
| `docs/` | 详情页文档与封面（中英） |
| `locale/` | 展示元信息与文案（en/zh） |

## 兼容性

- 目标 DSH `0.2.1-rc.3`（槽位 props 契约与 `dsh-plugin-whale-pet` 0.2.9 同款接法）
- DSH 升级可能改变槽位契约；异常时插件自动降级为纯动画待机，不影响主界面

## 许可

MIT —— 见 [LICENSE](LICENSE) 与 [NOTICE.md](NOTICE.md)。
