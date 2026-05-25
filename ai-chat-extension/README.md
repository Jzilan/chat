# AI Chat Assistant — 纯 JS 模块

> 🔮 单个 `ai-chat.js` 文件，托管到 GitHub 后一行 import 即可注入任意网页  
> 悬浮球 · 聊天面板 · 人物管理 · API 配置 · 全部自包含

---

## 📦 项目文件

```
ai-chat/
├── ai-chat.js     ★ 唯一需要的文件（含 CSS + 全部逻辑）
└── README.md
```

---

## 🚀 第一步：上传到 GitHub

```
1. 在 GitHub 新建一个仓库（如 yourname/ai-chat）
2. 把 ai-chat.js 上传到仓库根目录
3. 获取 raw 链接：
   https://raw.githubusercontent.com/你的用户名/ai-chat/main/ai-chat.js
```

> ⚠️ 必须用 **raw** 链接，不能用 `blob` 链接（否则 MIME 类型不对，浏览器会拒绝执行）

---

## 🚀 第二步：从外部 import 注入

### 方法 1：浏览器控制台（最快）

在 GitHub 或其他网页按 `F12` 打开控制台，粘贴：

```js
const s = document.createElement('script');
s.type = 'module';
s.src = 'https://raw.githubusercontent.com/你的用户名/ai-chat/main/ai-chat.js';
document.head.appendChild(s);
```

✅ 右下角立即出现 🔴 悬浮球

### 方法 2：ES Module 动态 import

在任何 JS 项目中：

```js
// 动态导入
import('https://raw.githubusercontent.com/你的用户名/ai-chat/main/ai-chat.js')
  .then(m => m.init());
```

### 方法 3：importmap（在 HTML 中声明）

在你的网页 HTML 里加：

```html
<script type="importmap">
{
  "imports": {
    "aichat": "https://raw.githubusercontent.com/你的用户名/ai-chat/main/ai-chat.js"
  }
}
</script>
<script type="module">
  import { init } from 'aichat';
  init();  // 页面加载后出现悬浮球
</script>
```

### 方法 4：直接 import 语句

```js
import { init, destroy, addCharacter, setApiConfig, getState } from 'https://raw.githubusercontent.com/你的用户名/ai-chat/main/ai-chat.js';
init();
```

---

## 🎮 对外 API

`ai-chat.js` 导出了这些方法，可在外部调用：

| 方法 | 说明 |
|------|------|
| `init()` | 初始化悬浮球和面板（页面加载时自动调用） |
| `destroy()` | 销毁悬浮球和面板 |
| `getState()` | 获取当前状态 |
| `addCharacter({ name, avatar, description, systemPrompt })` | 外部添加人物 |
| `setApiConfig({ apiUrl, apiKey, model, ... })` | 外部设置 API 配置 |

### 示例：外部程序化操作

```js
// 导入
import { init, addCharacter, setApiConfig, destroy } from 'https://raw.githubusercontent.com/xxx/ai-chat/main/ai-chat.js';

// 设置 API（这样用户就不用手动配置了）
setApiConfig({
  apiUrl: 'https://api.openai.com/v1/chat/completions',
  apiKey: 'sk-xxx',
  model: 'gpt-4o'
});

// 添加人物
addCharacter({
  name: '心理医生',
  avatar: '🧑‍⚕️',
  description: '专业心理咨询',
  systemPrompt: '你是一位共情力强的心理咨询师...'
});

// 初始化
init();

// 销毁
// destroy();
```

---

## ⚙️ 对接 SillyTavern

1. SillyTavern 开启「API 服务器」插件 → 默认 `http://127.0.0.1:8000`
2. 注入脚本后点 ⚙️ → 快捷模板 → 🏰 SillyTavern
3. API Key 留空
4. 保存即可

---

## 🔒 存储方式

全部数据存于浏览器 `localStorage`，前缀 `aichat_`：
- `aichat_api` — API 配置
- `aichat_chars` — 人物列表
- `aichat_active` — 当前激活人物 ID
- `aichat_msgs` — 对话记录

---

## 📄 License

MIT
