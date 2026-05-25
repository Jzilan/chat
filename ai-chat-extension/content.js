// ============================================================
//  AI Chat Assistant - Content Script v2
//  悬浮球 + 侧边面板（聊天 / 人物 / 设置 三面板）
// ============================================================

(function () {
  'use strict';

  // ========== 常量 ==========
  const PANEL_WIDTH = 420;
  const PANEL_HEIGHT_FRAC = 0.92;
  const FLOAT_SIZE = 56;

  const DEFAULT_CHARACTERS = [
    {
      id: 'assistant', name: '通用助手', avatar: '🤖', role: 'assistant',
      description: '友好、乐于助人的AI助手',
      systemPrompt: '你是一个友好、乐于助人的AI助手。请用清晰、简洁的方式回答用户的问题。'
    },
    {
      id: 'coder', name: '编程导师', avatar: '💻', role: 'assistant',
      description: '代码讲解、调试与最佳实践',
      systemPrompt: '你是一位经验丰富的编程导师。用通俗易懂的方式讲解概念，帮助调试代码，提供最佳实践建议。回答时附上代码示例。'
    },
    {
      id: 'translator', name: '翻译专家', avatar: '🌐', role: 'assistant',
      description: '专业多语言翻译',
      systemPrompt: '你是一位专业翻译专家，精通中英日韩等语言。准确地道翻译，解释文化差异和语境。'
    },
    {
      id: 'writer', name: '创意写手', avatar: '✍️', role: 'assistant',
      description: '各类文案创意写作',
      systemPrompt: '你是一位创意写作助手，擅长文章、故事、诗歌、文案等。请提供有创意、有感染力的文字。'
    }
  ];

  const QUICK_CONFIGS = {
    openai:   { apiUrl: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o', maxTokens: 4096, temperature: 0.7 },
    deepseek: { apiUrl: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat', maxTokens: 4096, temperature: 0.7 },
    qwen:     { apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-turbo', maxTokens: 2048, temperature: 0.7 },
    zhipu:    { apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash', maxTokens: 4096, temperature: 0.7 }
  };

  // ========== 状态 ==========
  let state = {
    panelOpen: false,
    activeTab: 'chat', // 'chat' | 'characters' | 'settings'
    characters: [...DEFAULT_CHARACTERS],
    activeCharId: 'assistant',
    messages: [],
    isStreaming: false,
    apiConfig: null
  };

  // ========== DOM 工具 ==========
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v);
    }
    for (const child of children) {
      if (typeof child === 'string') el.appendChild(document.createTextNode(child));
      else if (child) el.appendChild(child);
    }
    return el;
  }

  const $ = (sel) => document.querySelector(sel);

  // ========== 存储 ==========
  async function loadFromStorage() {
    try {
      const result = await chrome.storage.local.get(['apiConfig', 'characters', 'activeCharId', 'messages']);
      if (result.apiConfig) state.apiConfig = result.apiConfig;
      else state.apiConfig = { apiUrl: 'https://api.openai.com/v1/chat/completions', apiKey: '', model: 'gpt-3.5-turbo', maxTokens: 2048, temperature: 0.7 };
      if (result.characters) state.characters = result.characters;
      if (result.activeCharId) state.activeCharId = result.activeCharId;
      if (result.messages) state.messages = result.messages.slice(-100);
    } catch (e) { /* ignore */ }
  }
  async function saveToStorage(key, val) {
    try { await chrome.storage.local.set({ [key]: val }); } catch (e) { /* ignore */ }
  }

  function getActiveChar() {
    return state.characters.find(c => c.id === state.activeCharId) || state.characters[0];
  }

  // ========== 悬浮球 ==========
  function createFloatBall() {
    const ball = h('div', {
      id: 'aichat-float-ball',
      className: 'aichat-float-ball',
      title: 'AI Chat Assistant',
      html: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
      onClick: togglePanel
    });
    document.body.appendChild(ball);
    // 拖拽
    let dragging = false, offsetX, offsetY;
    ball.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      dragging = false;
      const rect = ball.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
    });
    ball.addEventListener('mousemove', (e) => {
      if (dragging === false && Math.abs(e.movementX) + Math.abs(e.movementY) > 2) {
        dragging = true;
      }
      if (dragging === true) {
        const x = Math.min(window.innerWidth - FLOAT_SIZE - 10, Math.max(10, e.clientX - offsetX));
        const y = Math.min(window.innerHeight - FLOAT_SIZE - 10, Math.max(10, e.clientY - offsetY));
        ball.style.left = x + 'px';
        ball.style.top = y + 'px';
        ball.style.right = 'auto';
        ball.style.bottom = 'auto';
      }
    });
    ball.addEventListener('mouseup', () => {
      if (dragging !== true) return; // was a click
    });
    // 防止拖拽后触发 click
    ball.addEventListener('click', (e) => {
      if (dragging === true) {
        e.stopPropagation();
        e.preventDefault();
        dragging = false;
      }
    }, true);
  }

  // ========== 面板 ==========
  function createPanel() {
    // 遮罩
    const overlay = h('div', { id: 'aichat-overlay', className: 'aichat-overlay', onClick: closePanel });

    // 面板容器
    const panel = h('div', { id: 'aichat-panel', className: 'aichat-panel', style: { width: PANEL_WIDTH + 'px' } });

    // 左侧导航
    const sidebar = h('div', { className: 'aichat-sidebar' });
    const tabs = [
      { id: 'chat',       icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>', label: '聊天' },
      { id: 'characters', icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>', label: '人物' },
      { id: 'settings',   icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>', label: '设置' }
    ];
    tabs.forEach(t => {
      const btn = h('div', {
        className: 'aichat-nav-btn' + (state.activeTab === t.id ? ' active' : ''),
        title: t.label,
        html: t.icon + '<span class="aichat-nav-label">' + t.label + '</span>',
        onClick: () => switchTab(t.id)
      });
      sidebar.appendChild(btn);
    });
    panel.appendChild(sidebar);

    // 右侧内容区
    const content = h('div', { id: 'aichat-content', className: 'aichat-content' });
    content.appendChild(createChatPanel());
    content.appendChild(createCharactersPanel());
    content.appendChild(createSettingsPanel());
    panel.appendChild(content);

    // 关闭按钮
    const closeBtn = h('div', {
      className: 'aichat-close-btn',
      html: '✕',
      onClick: closePanel
    });
    panel.appendChild(closeBtn);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    showPanel(state.activeTab);
  }

  // ==================== 面板切换 ====================
  function switchTab(tabId) {
    state.activeTab = tabId;
    showPanel(tabId);
    // 更新导航高亮
    document.querySelectorAll('.aichat-nav-btn').forEach((btn, i) => {
      const ids = ['chat', 'characters', 'settings'];
      btn.classList.toggle('active', ids[i] === tabId);
    });
    if (tabId === 'chat') renderMessages();
    if (tabId === 'characters') renderCharacters();
    if (tabId === 'settings') renderSettings();
  }

  function showPanel(tabId) {
    const panels = {
      chat: document.getElementById('aichat-chat-panel'),
      characters: document.getElementById('aichat-characters-panel'),
      settings: document.getElementById('aichat-settings-panel')
    };
    Object.entries(panels).forEach(([id, el]) => {
      if (el) el.style.display = id === tabId ? 'flex' : 'none';
    });
  }

  // ==================== 聊天面板 ====================
  function createChatPanel() {
    const panel = h('div', { id: 'aichat-chat-panel', className: 'aichat-inner-panel', style: { display: 'flex', flexDirection: 'column', height: '100%' } });

    // 顶部角色条
    const topBar = h('div', { className: 'aichat-chat-topbar', html: `
      <span class="aichat-chat-avatar" id="aichat-chat-avatar">🤖</span>
      <span class="aichat-chat-char-name" id="aichat-chat-char-name">通用助手</span>
      <button class="aichat-chat-clear" id="aichat-chat-clear" title="清空对话">🗑️</button>
    `});
    panel.appendChild(topBar);

    // 消息区
    const msgContainer = h('div', { id: 'aichat-msg-container', className: 'aichat-msg-container' });
    panel.appendChild(msgContainer);

    // 输入区
    const inputArea = h('div', { className: 'aichat-input-area' });
    const inputRow = h('div', { className: 'aichat-input-row' });
    const textarea = h('textarea', {
      id: 'aichat-msg-input',
      className: 'aichat-msg-input',
      placeholder: '输入消息… (Enter 发送)',
      rows: '1'
    });
    const sendBtn = h('button', {
      id: 'aichat-send-btn',
      className: 'aichat-send-btn',
      html: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>',
      onClick: sendMessage
    });
    inputRow.appendChild(textarea);
    inputRow.appendChild(sendBtn);
    inputArea.appendChild(inputRow);
    const statusBar = h('div', { className: 'aichat-status-bar', id: 'aichat-status', textContent: '就绪' });
    inputArea.appendChild(statusBar);
    panel.appendChild(inputArea);

    // 事件
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    return panel;
  }

  function updateChatTopBar() {
    const c = getActiveChar();
    const avatar = document.getElementById('aichat-chat-avatar');
    const name = document.getElementById('aichat-chat-char-name');
    if (avatar) avatar.textContent = c.avatar;
    if (name) name.textContent = c.name;
  }

  // ==================== 发送消息 ====================
  async function sendMessage() {
    if (state.isStreaming) return;
    const input = document.getElementById('aichat-msg-input');
    if (!input) return;
    const content = input.value.trim();
    if (!content) return;

    if (!state.apiConfig || !state.apiConfig.apiKey) {
      document.getElementById('aichat-status').textContent = '⚠️ 请先在设置页面配置 API Key';
      return;
    }

    state.isStreaming = true;
    const sendBtn = document.getElementById('aichat-send-btn');
    if (sendBtn) sendBtn.disabled = true;
    input.value = '';
    input.style.height = 'auto';

    state.messages.push({ role: 'user', content });
    await saveToStorage('messages', state.messages);
    appendMsg('user', content);

    const typingEl = showTyping();
    setStatus('正在思考…');

    try {
      const activeChar = getActiveChar();
      const recentMsgs = state.messages.slice(-20).map(m => ({ role: m.role, content: m.content }));
      const body = {
        model: state.apiConfig.model,
        messages: [{ role: 'system', content: activeChar.systemPrompt }, ...recentMsgs],
        max_tokens: state.apiConfig.maxTokens || 2048,
        temperature: state.apiConfig.temperature || 0.7
      };
      const resp = await fetch(state.apiConfig.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + state.apiConfig.apiKey },
        body: JSON.stringify(body)
      });
      if (!resp.ok) {
        const txt = await resp.text();
        let msg;
        try { msg = JSON.parse(txt).error?.message || 'HTTP ' + resp.status; } catch (e) { msg = 'HTTP ' + resp.status; }
        throw new Error(msg);
      }
      const data = await resp.json();
      const reply = data.choices?.[0]?.message?.content || '(空回复)';
      removeEl(typingEl);
      state.messages.push({ role: 'assistant', content: reply });
      await saveToStorage('messages', state.messages);
      appendMsg('assistant', reply);
      setStatus('就绪');
    } catch (err) {
      removeEl(typingEl);
      setStatus('❌ ' + err.message);
    } finally {
      state.isStreaming = false;
      if (sendBtn) sendBtn.disabled = false;
      input.focus();
    }
  }

  function appendMsg(role, content) {
    const container = document.getElementById('aichat-msg-container');
    if (!container) return;
    const c = getActiveChar();
    const avatarIcon = role === 'user' ? '🧑' : c.avatar;
    const msg = h('div', { className: 'aichat-message aichat-msg-' + role, html: `
      <span class="aichat-msg-avatar">${avatarIcon}</span>
      <div class="aichat-msg-bubble">${escapeHtml(content)}</div>
    ` });
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  function showTyping() {
    const container = document.getElementById('aichat-msg-container');
    if (!container) return null;
    const c = getActiveChar();
    const el = h('div', { className: 'aichat-message aichat-msg-assistant aichat-typing', html: `
      <span class="aichat-msg-avatar">${c.avatar}</span>
      <div class="aichat-msg-bubble"><span class="aichat-dot"></span><span class="aichat-dot"></span><span class="aichat-dot"></span></div>
    ` });
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
    return el;
  }

  function renderMessages() {
    const container = document.getElementById('aichat-msg-container');
    if (!container) return;
    container.innerHTML = '';
    if (state.messages.length === 0) {
      const c = getActiveChar();
      container.innerHTML = `<div class="aichat-welcome"><div class="aichat-welcome-icon">${c.avatar}</div><div>${c.name}</div><div style="color:var(--c-text-2);font-size:12px">开始对话吧</div></div>`;
    } else {
      state.messages.forEach(m => appendMsg(m.role, m.content));
    }
  }

  function setStatus(text) {
    const el = document.getElementById('aichat-status');
    if (el) el.textContent = text;
  }

  // ==================== 人物面板 ====================
  function createCharactersPanel() {
    const panel = h('div', { id: 'aichat-characters-panel', className: 'aichat-inner-panel', style: { display: 'none', flexDirection: 'column', height: '100%' } });

    const header = h('div', { className: 'aichat-panel-header', html: `
      <span style="font-weight:700">人物管理</span>
      <button class="aichat-char-add-btn" id="aichat-char-add-btn">+ 添加</button>
    ` });
    panel.appendChild(header);

    const grid = h('div', { id: 'aichat-char-grid', className: 'aichat-char-grid' });
    panel.appendChild(grid);

    return panel;
  }

  function renderCharacters() {
    const grid = document.getElementById('aichat-char-grid');
    if (!grid) return;
    const isSettingsOpen = !!document.getElementById('aichat-char-modal');
    if (isSettingsOpen) return; // 如果弹窗开着就不刷新

    grid.innerHTML = state.characters.map(c => {
      const isActive = c.id === state.activeCharId;
      return `
        <div class="aichat-char-card ${isActive ? 'active' : ''}" data-id="${c.id}">
          <div class="aichat-char-card-avatar">${c.avatar}</div>
          <div class="aichat-char-card-name">${c.name}</div>
          <div class="aichat-char-card-desc">${escapeHtml(c.description)}</div>
          <div class="aichat-char-card-actions">
            <button class="aichat-char-btn activate" data-action="activate" data-id="${c.id}">${isActive ? '✓ 当前' : '启用'}</button>
            <button class="aichat-char-btn edit" data-action="edit" data-id="${c.id}">编辑</button>
            <button class="aichat-char-btn delete" data-action="delete" data-id="${c.id}">删除</button>
          </div>
        </div>
      `;
    }).join('');

    // 绑定事件
    grid.querySelectorAll('.aichat-char-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (action === 'activate') {
          state.activeCharId = id;
          await saveToStorage('activeCharId', id);
          renderCharacters();
          updateChatTopBar();
        } else if (action === 'edit') {
          openCharModal(id);
        } else if (action === 'delete') {
          if (state.characters.length <= 1) { alert('至少保留一个角色'); return; }
          if (!confirm('确定删除？')) return;
          state.characters = state.characters.filter(c => c.id !== id);
          await saveToStorage('characters', state.characters);
          if (state.activeCharId === id) {
            state.activeCharId = state.characters[0].id;
            await saveToStorage('activeCharId', state.activeCharId);
            updateChatTopBar();
          }
          renderCharacters();
        }
      });
    });

    // 添加按钮
    const addBtn = document.getElementById('aichat-char-add-btn');
    if (addBtn) {
      addBtn.onclick = () => openCharModal();
    }
  }

  // 人物编辑弹窗
  function openCharModal(id) {
    const existing = document.getElementById('aichat-char-modal');
    if (existing) existing.remove();

    const char = id ? state.characters.find(c => c.id === id) : null;
    const isEdit = !!char;

    const modal = h('div', { id: 'aichat-char-modal', className: 'aichat-modal-overlay' });
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    const box = h('div', { className: 'aichat-modal-box' });

    const avatars = ['🤖','🧑‍⚕️','👨‍💻','🧑‍🏫','🎨','📚','🧠','💡','🔬','🎵','🏋️','🍳','✍️','💻','🌐','🤝','🎯','🔍','📊','🎮','🐱','🐶','🌟','⚡','🔥','💎'];

    box.innerHTML = `
      <div class="aichat-modal-header">
        <span>${isEdit ? '编辑人物' : '添加人物'}</span>
        <button class="aichat-modal-close">✕</button>
      </div>
      <div class="aichat-modal-body">
        <div class="aichat-form-group">
          <label>名称</label>
          <input type="text" id="aichat-char-form-name" value="${isEdit ? escapeHtml(char.name) : ''}" placeholder="角色名称" />
        </div>
        <div class="aichat-form-group">
          <label>头像</label>
          <input type="text" id="aichat-char-form-avatar" value="${isEdit ? char.avatar : '🤖'}" maxlength="4" />
          <div class="aichat-emoji-grid">${avatars.map(a => `<span class="aichat-emoji-btn">${a}</span>`).join('')}</div>
        </div>
        <div class="aichat-form-group">
          <label>描述</label>
          <input type="text" id="aichat-char-form-desc" value="${isEdit ? escapeHtml(char.description) : ''}" placeholder="简短描述" />
        </div>
        <div class="aichat-form-group">
          <label>人设提示词</label>
          <textarea id="aichat-char-form-prompt" rows="5" placeholder="描述AI角色的性格、能力和回复风格…">${isEdit ? escapeHtml(char.systemPrompt) : ''}</textarea>
        </div>
      </div>
      <div class="aichat-modal-footer">
        <button class="aichat-btn-outline aichat-modal-close-btn">取消</button>
        <button class="aichat-btn-primary" id="aichat-char-save-btn">保存</button>
      </div>
    `;

    modal.appendChild(box);
    document.body.appendChild(modal);

    // emoji 选择
    box.querySelectorAll('.aichat-emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('aichat-char-form-avatar').value = btn.textContent;
      });
    });

    // 关闭
    box.querySelector('.aichat-modal-close').onclick = () => modal.remove();
    box.querySelector('.aichat-modal-close-btn').onclick = () => modal.remove();

    // 保存
    document.getElementById('aichat-char-save-btn').addEventListener('click', async () => {
      const name = document.getElementById('aichat-char-form-name').value.trim();
      const avatar = document.getElementById('aichat-char-form-avatar').value.trim() || '🤖';
      const desc = document.getElementById('aichat-char-form-desc').value.trim();
      const prompt = document.getElementById('aichat-char-form-prompt').value.trim();
      if (!name || !desc || !prompt) { alert('请填写完整'); return; }
      if (isEdit) {
        const idx = state.characters.findIndex(c => c.id === id);
        if (idx !== -1) state.characters[idx] = { ...state.characters[idx], name, avatar, role: 'assistant', description: desc, systemPrompt: prompt };
      } else {
        state.characters.push({ id: 'c_' + Date.now(), name, avatar, role: 'assistant', description: desc, systemPrompt: prompt });
      }
      await saveToStorage('characters', state.characters);
      modal.remove();
      renderCharacters();
      updateChatTopBar();
    });
  }

  // ==================== 设置面板 ====================
  function createSettingsPanel() {
    const panel = h('div', { id: 'aichat-settings-panel', className: 'aichat-inner-panel', style: { display: 'none', flexDirection: 'column', height: '100%' } });

    panel.innerHTML = `
      <div class="aichat-panel-header"><span style="font-weight:700">API 配置</span></div>
      <div class="aichat-settings-body">
        <div class="aichat-form-group">
          <label>API 地址</label>
          <input type="url" id="aichat-set-url" placeholder="https://api.openai.com/v1/chat/completions" />
        </div>
        <div class="aichat-form-group">
          <label>API Key</label>
          <div style="display:flex;gap:6px">
            <input type="password" id="aichat-set-key" placeholder="sk-..." style="flex:1" />
            <button class="aichat-btn-outline" id="aichat-set-toggle-key" style="width:40px;padding:0">👁️</button>
          </div>
        </div>
        <div class="aichat-form-group">
          <label>模型</label>
          <input type="text" id="aichat-set-model" placeholder="gpt-3.5-turbo" />
        </div>
        <div class="aichat-form-row">
          <div class="aichat-form-group" style="flex:1">
            <label>Max Tokens</label>
            <input type="number" id="aichat-set-maxtokens" min="1" max="128000" value="2048" />
          </div>
          <div class="aichat-form-group" style="flex:1">
            <label>Temperature</label>
            <div style="display:flex;align-items:center;gap:8px">
              <input type="range" id="aichat-set-temp" min="0" max="2" step="0.1" value="0.7" style="flex:1" />
              <span id="aichat-set-temp-val" style="min-width:28px;text-align:center">0.7</span>
            </div>
          </div>
        </div>
        <div class="aichat-settings-actions">
          <button class="aichat-btn-primary" id="aichat-set-save">💾 保存</button>
          <button class="aichat-btn-outline" id="aichat-set-test">🔌 测试连接</button>
        </div>
        <div id="aichat-set-result" style="display:none;margin-top:12px;padding:10px;border-radius:8px;font-size:12px"></div>
        <div style="margin-top:20px">
          <div style="font-size:13px;font-weight:600;margin-bottom:8px">快捷模板</div>
          <div class="aichat-quick-configs">
            <button class="aichat-quick-btn" data-provider="openai">🧠 OpenAI</button>
            <button class="aichat-quick-btn" data-provider="deepseek">🔍 DeepSeek</button>
            <button class="aichat-quick-btn" data-provider="qwen">☁️ 通义千问</button>
            <button class="aichat-quick-btn" data-provider="zhipu">🌌 智谱GLM</button>
          </div>
        </div>
      </div>
    `;

    return panel;
  }

  function renderSettings() {
    const cfg = state.apiConfig || { apiUrl: '', apiKey: '', model: '', maxTokens: 2048, temperature: 0.7 };
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    setVal('aichat-set-url', cfg.apiUrl);
    setVal('aichat-set-key', cfg.apiKey);
    setVal('aichat-set-model', cfg.model);
    setVal('aichat-set-maxtokens', cfg.maxTokens);
    const tempEl = document.getElementById('aichat-set-temp');
    if (tempEl) { tempEl.value = cfg.temperature; document.getElementById('aichat-set-temp-val').textContent = cfg.temperature; }

    // 事件绑定
    const bind = (id, evt, fn) => { const el = document.getElementById(id); if (el && !el._bound) { el.addEventListener(evt, fn); el._bound = true; } };
    bind('aichat-set-save', 'click', saveSettings);
    bind('aichat-set-test', 'click', testConnection);
    bind('aichat-set-toggle-key', 'click', () => {
      const inp = document.getElementById('aichat-set-key');
      if (inp) {
        inp.type = inp.type === 'password' ? 'text' : 'password';
        document.getElementById('aichat-set-toggle-key').textContent = inp.type === 'password' ? '👁️' : '🙈';
      }
    });
    const tempSlider = document.getElementById('aichat-set-temp');
    if (tempSlider && !tempSlider._bound2) {
      tempSlider.addEventListener('input', () => {
        document.getElementById('aichat-set-temp-val').textContent = tempSlider.value;
      });
      tempSlider._bound2 = true;
    }

    // 快捷配置
    document.querySelectorAll('.aichat-quick-btn').forEach(btn => {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', () => {
        const preset = QUICK_CONFIGS[btn.dataset.provider];
        if (!preset) return;
        const curKey = document.getElementById('aichat-set-key').value;
        setVal('aichat-set-url', preset.apiUrl);
        setVal('aichat-set-model', preset.model);
        setVal('aichat-set-maxtokens', preset.maxTokens);
        setVal('aichat-set-temp', preset.temperature);
        document.getElementById('aichat-set-temp-val').textContent = preset.temperature;
        if (curKey) setVal('aichat-set-key', curKey);
        showSetResult('success', '已应用 ' + btn.dataset.provider + ' 配置');
      });
    });
  }

  async function saveSettings() {
    const config = {
      apiUrl: document.getElementById('aichat-set-url').value.trim(),
      apiKey: document.getElementById('aichat-set-key').value.trim(),
      model: document.getElementById('aichat-set-model').value.trim(),
      maxTokens: parseInt(document.getElementById('aichat-set-maxtokens').value) || 2048,
      temperature: parseFloat(document.getElementById('aichat-set-temp').value) || 0.7
    };
    state.apiConfig = config;
    await saveToStorage('apiConfig', config);
    showSetResult('success', '✅ 配置已保存');
  }

  async function testConnection() {
    const config = {
      apiUrl: document.getElementById('aichat-set-url').value.trim(),
      apiKey: document.getElementById('aichat-set-key').value.trim(),
      model: document.getElementById('aichat-set-model').value.trim()
    };
    if (!config.apiUrl || !config.apiKey) { showSetResult('error', '请填写 API 地址和 Key'); return; }
    showSetResult('loading', '⏳ 测试连接…');
    try {
      const resp = await fetch(config.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + config.apiKey },
        body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content: 'Say OK' }], max_tokens: 5 })
      });
      if (resp.ok) {
        showSetResult('success', '✅ 连接成功！');
        await saveSettings();
      } else {
        const txt = await resp.text();
        let msg;
        try { msg = JSON.parse(txt).error?.message || 'HTTP ' + resp.status; } catch (e) { msg = 'HTTP ' + resp.status; }
        showSetResult('error', '❌ ' + msg);
      }
    } catch (e) {
      showSetResult('error', '❌ 网络错误: ' + e.message);
    }
  }

  function showSetResult(type, msg) {
    const el = document.getElementById('aichat-set-result');
    if (!el) return;
    el.style.display = 'block';
    el.className = '';
    el.classList.add('aichat-set-result', 'aichat-set-' + type);
    el.textContent = msg;
    setTimeout(() => { el.style.display = 'none'; }, 4000);
  }

  // ==================== 打开/关闭面板 ====================
  function togglePanel() {
    if (state.panelOpen) closePanel();
    else openPanel();
  }

  function openPanel() {
    const overlay = document.getElementById('aichat-overlay');
    if (!overlay) {
      createPanel();
      updateChatTopBar();
      renderMessages();
    }
    state.panelOpen = true;
    const o = document.getElementById('aichat-overlay');
    const p = document.getElementById('aichat-panel');
    if (o) { o.style.display = 'flex'; setTimeout(() => o.classList.add('open'), 10); }
    if (p) { p.classList.add('open'); }
    document.getElementById('aichat-float-ball').style.display = 'none';
    if (state.activeTab === 'characters') renderCharacters();
    if (state.activeTab === 'settings') renderSettings();
  }

  function closePanel() {
    state.panelOpen = false;
    const o = document.getElementById('aichat-overlay');
    const p = document.getElementById('aichat-panel');
    if (o) o.classList.remove('open');
    if (p) p.classList.remove('open');
    setTimeout(() => { if (o) o.style.display = 'none'; }, 300);
    const ball = document.getElementById('aichat-float-ball');
    if (ball) ball.style.display = 'flex';
  }

  // ==================== 工具函数 ====================
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  function removeEl(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }

  // ==================== 初始化 ====================
  async function init() {
    await loadFromStorage();
    createFloatBall();

    // 全局关闭快捷键 ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.panelOpen) {
        // 检查是否有弹窗，有则先关弹窗
        const modal = document.getElementById('aichat-char-modal');
        if (modal) { modal.remove(); return; }
        closePanel();
      }
    });
  }

  init();
})();
