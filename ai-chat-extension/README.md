# AI Chat Assistant — 悬浮球 AI 对话助手

> 🔮 可注入 GitHub / SillyTavern / 任意网页的悬浮球 AI 聊天面板  
> 支持多人物人设 · 自定义 API · 三面板切换

---

## 📦 两种注入方式

| 方式 | 文件 | 适用场景 |
|------|------|---------|
| **方式一：Chrome 扩展** | `manifest.json` + `content.js` + `content.css` | 永久安装，所有网页自动生效 |
| **方式二：Tampermonkey 脚本** | `ai-chat-assistant.user.js` | 轻量注入，无需加载扩展，支持所有支持油猴的浏览器 |

> 两种方式功能完全相同，选一种即可。

---

## 🚀 方式一：注入 GitHub / 任意网页（Chrome 扩展）

### 步骤：

```
1. 打开 Chrome → 地址栏输入 chrome://extensions/ → 回车
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 ai-chat-extension 整个文件夹
5. 刷新 GitHub 或其他任意网页
6. 右下角出现 🔴 红色悬浮球 → 点击即可
```

✅ **GitHub、GitLab、StackOverflow、SillyTavern 网页端…所有页面右下角都会出现悬浮球。**

---

## 🚀 方式二：注入到 SillyTavern / 任意网页（Tampermonkey 脚本）

> 推荐此方式对接 SillyTavern，因为 SillyTavern 本身就是本地 Web 服务，用 Tampermonkey 注入最灵活。

### 步骤：

```
1. 安装 Tampermonkey 扩展
   → Chrome: https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo

2. 打开 Tampermonkey → 点击「添加新脚本」

3. 用文本编辑器打开 ai-chat-assistant.user.js，全选复制粘贴进去
   （或直接拖拽 .user.js 文件到 Tampermonkey 页面）

4. Ctrl+S 保存

5. 刷新 SillyTavern 页面 (http://127.0.0.1:8000) 或 GitHub
6. 右下角出现 🔴 悬浮球
```

✅ **SillyTavern 网页端、GitHub 等任何匹配 `*://*/*` 的页面都会出现悬浮球。**

---

## ⚙️ 如何对接 SillyTavern 的 API

SillyTavern 自带 OpenAI 兼容的 API 端点，可以直接用我们的面板调用：

### 在 SillyTavern 中启用 API：

```
1. 打开 SillyTavern → 点击顶部「插件」图标 (🔌)
2. 确认「API 服务器」已开启
3. 默认地址：http://127.0.0.1:8000
```

### 在悬浮球面板中配置：

```
1. 点击悬浮球 → 左侧 ⚙️ 设置
2. API 地址填：http://127.0.0.1:8000/v1/chat/completions
   → 或直接点「快捷模板」里的 🏰 SillyTavern
3. API Key 留空（SillyTavern 默认不需要 Key）
   或填 SillyTavern 中设置的 API Key
4. 模型名填 SillyTavern 当前使用的模型（如 gpt-3.5-turbo）
5. 点击「测试连接」→ 「保存」
```

✅ 这样就用 SillyTavern 连接的后端 AI 模型来驱动我们的聊天面板了！

---

## 🎯 使用流程

```
打开任意网页
  ↓
右下角出现红色悬浮球 🔴
  ↓
点击悬浮球 → 侧边面板滑出
  ↓
┌──────┬──────────────────────┐
│      │                      │
│  💬  │  聊天对话界面         │
│  👤  │  人物选择/管理        │
│  ⚙️  │  API 配置            │
│      │                      │
└──────┴──────────────────────┘
  ↓
ESC 关闭面板，悬浮球重新出现
```

---

## 🎭 预置角色

| 角色 | 描述 |
|------|------|
| 🤖 通用助手 | 友好、乐于助人 |
| 💻 编程导师 | 代码讲解、调试 |
| 🌐 翻译专家 | 多语言翻译 |
| ✍️ 创意写手 | 文案创作 |

自定义角色：点 👤 标签 → 点「+ 添加」→ 填写名称/emoji/人设提示词

---

## 📁 文件说明

```
ai-chat-extension/
├── manifest.json              # Chrome 扩展配置
├── content.js                 # Chrome 扩展注入脚本
├── content.css                # Chrome 扩展样式
├── ai-chat-assistant.user.js  # Tampermonkey 独立脚本（★ 推荐用于 SillyTavern）
├── icons/                     # 图标
└── README.md
```

| 文件 | 用途 |
|------|------|
| `content.js` + `content.css` | Chrome 扩展模式，自动注入所有网页 |
| `ai-chat-assistant.user.js` | Tampermonkey 用户脚本，单个文件包含全部 CSS+JS，可独立使用 |

---

## 🔒 隐私

- 全部数据存于 `chrome.storage.local` 或 Tampermonkey `GM_setValue`（本地）
- API Key 不离开浏览器
- 无任何远程上报

## 📄 License

MIT
