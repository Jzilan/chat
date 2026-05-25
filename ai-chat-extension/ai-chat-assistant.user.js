// ==UserScript==
// @name         AI Chat Assistant - Floating Chat
// @namespace    https://github.com/yourname/ai-chat-assistant
// @version      1.0.0
// @description  悬浮球 AI 对话助手：在任何网页右下角显示悬浮球，点击打开聊天面板（支持多人物/自定义API）
// @author       You
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  // ========== 兼容 chrome.storage 和 GM 存储 ==========
  const storage = {
    async get(keys) {
      const result = {};
      for (const k of (Array.isArray(keys) ? keys : [keys])) {
        const val = await GM_getValue(k, null);
        if (val !== null) result[k] = JSON.parse(val);
      }
      return result;
    },
    async set(obj) {
      for (const [k, v] of Object.entries(obj)) {
        await GM_setValue(k, JSON.stringify(v));
      }
    },
    async remove(key) { await GM_deleteValue(key); }
  };

  // ========== 常量 ==========
  const PANEL_WIDTH = 420;
  const FLOAT_SIZE = 56;

  const DEFAULT_CHARACTERS = [
    { id: 'assistant', name: '通用助手', avatar: '🤖', role: 'assistant', description: '友好、乐于助人的AI助手', systemPrompt: '你是一个友好、乐于助人的AI助手。请用清晰、简洁的方式回答用户的问题。' },
    { id: 'coder', name: '编程导师', avatar: '💻', role: 'assistant', description: '代码讲解、调试与最佳实践', systemPrompt: '你是一位经验丰富的编程导师。用通俗易懂的方式讲解概念，帮助调试代码，提供最佳实践建议。回答时附上代码示例。' },
    { id: 'translator', name: '翻译专家', avatar: '🌐', role: 'assistant', description: '专业多语言翻译', systemPrompt: '你是一位专业翻译专家，精通中英日韩等语言。准确地道翻译，解释文化差异和语境。' },
    { id: 'writer', name: '创意写手', avatar: '✍️', role: 'assistant', description: '各类文案创意写作', systemPrompt: '你是一位创意写作助手，擅长文章、故事、诗歌、文案等。请提供有创意、有感染力的文字。' }
  ];

  const QUICK_CONFIGS = {
    openai:   { apiUrl: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o', maxTokens: 4096, temperature: 0.7 },
    deepseek: { apiUrl: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat', maxTokens: 4096, temperature: 0.7 },
    qwen:     { apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-turbo', maxTokens: 2048, temperature: 0.7 },
    zhipu:    { apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash', maxTokens: 4096, temperature: 0.7 },
    silly:    { apiUrl: 'http://127.0.0.1:8000/v1/chat/completions', model: 'gpt-3.5-turbo', maxTokens: 4096, temperature: 0.7 }
  };

  // ========== 状态 ==========
  let state = {
    panelOpen: false, activeTab: 'chat',
    characters: [...DEFAULT_CHARACTERS], activeCharId: 'assistant',
    messages: [], isStreaming: false,
    apiConfig: { apiUrl: 'https://api.openai.com/v1/chat/completions', apiKey: '', model: 'gpt-3.5-turbo', maxTokens: 2048, temperature: 0.7 }
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
      else if (child && child.nodeType) el.appendChild(child);
    }
    return el;
  }

  // ========== 存储 ==========
  async function loadFromStorage() {
    try {
      const result = await storage.get(['apiConfig', 'characters', 'activeCharId', 'messages']);
      if (result.apiConfig) state.apiConfig = result.apiConfig;
      if (result.characters) state.characters = result.characters;
      if (result.activeCharId) state.activeCharId = result.activeCharId;
      if (result.messages) state.messages = result.messages.slice(-100);
    } catch (e) { /* ignore */ }
  }

  async function saveToStorage(key, val) {
    try { await storage.set({ [key]: val }); } catch (e) { /* ignore */ }
  }

  function getActiveChar() {
    return state.characters.find(c => c.id === state.activeCharId) || state.characters[0];
  }

  // ========== 悬浮球 ==========
  function createFloatBall() {
    const ball = h('div', {
      id: 'aichat-fb',
      className: 'aichat-fb',
      title: 'AI Chat Assistant',
      html: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
      onClick: togglePanel
    });
    document.body.appendChild(ball);
    let dragging = false, wasDrag = false, sx, sy;
    ball.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      wasDrag = false; const r = ball.getBoundingClientRect(); sx = e.clientX - r.left; sy = e.clientY - r.top;
    });
    ball.addEventListener('mousemove', e => {
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) wasDrag = true;
      if (wasDrag) {
        const x = Math.min(window.innerWidth - FLOAT_SIZE - 10, Math.max(10, e.clientX - sx));
        const y = Math.min(window.innerHeight - FLOAT_SIZE - 10, Math.max(10, e.clientY - sy));
        ball.style.left = x + 'px'; ball.style.top = y + 'px'; ball.style.right = 'auto'; ball.style.bottom = 'auto';
      }
    });
    ball.addEventListener('click', e => { if (wasDrag) { e.stopPropagation(); e.preventDefault(); } }, true);
  }

  // ========== 面板 ==========
  function createPanel() {
    const overlay = h('div', { id: 'aichat-ov', className: 'aichat-ov', onClick: closePanel });
    const panel = h('div', { id: 'aichat-pn', className: 'aichat-pn', style: { width: PANEL_WIDTH + 'px' } });

    // 侧边导航
    const sb = h('div', { className: 'aichat-sb' });
    [
      ['chat', '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>', '聊天'],
      ['characters', '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>', '人物'],
      ['settings', '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>', '设置']
    ].forEach(([id, icon, label]) => {
      sb.appendChild(h('div', { className: 'aichat-nb' + (state.activeTab === id ? ' aichat-nb-a' : ''), html: icon + '<span class="aichat-nbl">' + label + '</span>', onClick: () => switchTab(id) }));
    });
    panel.appendChild(sb);

    const content = h('div', { id: 'aichat-ct', className: 'aichat-ct' });
    content.appendChild(createChatPanel());
    content.appendChild(createCharactersPanel());
    content.appendChild(createSettingsPanel());
    panel.appendChild(content);

    panel.appendChild(h('div', { className: 'aichat-cl', html: '✕', onClick: closePanel }));
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    showPanel(state.activeTab);
  }

  // ========== 面板切换 ==========
  function switchTab(tabId) {
    state.activeTab = tabId;
    document.querySelectorAll('.aichat-nb').forEach((btn, i) => {
      btn.classList.toggle('aichat-nb-a', ['chat', 'characters', 'settings'][i] === tabId);
    });
    showPanel(tabId);
    if (tabId === 'chat') renderMessages();
    if (tabId === 'characters') renderCharacters();
    if (tabId === 'settings') renderSettings();
  }

  function showPanel(tabId) {
    ['chat','characters','settings'].forEach(id => {
      const el = document.getElementById('aichat-pnl-' + id);
      if (el) el.style.display = id === tabId ? 'flex' : 'none';
    });
  }

  // ========== 聊天面板 ==========
  function createChatPanel() {
    const p = h('div', { id: 'aichat-pnl-chat', className: 'aichat-ip', style: { display: 'flex', flexDirection: 'column', height: '100%' } });
    p.innerHTML = `
      <div class="aichat-ctb"><span class="aichat-cav" id="aichat-cav">🤖</span><span class="aichat-cnm" id="aichat-cnm">通用助手</span><button class="aichat-ccl" id="aichat-ccl" title="清空">🗑️</button></div>
      <div class="aichat-mgc" id="aichat-mgc"></div>
      <div class="aichat-ina">
        <div class="aichat-inr">
          <textarea class="aichat-mgi" id="aichat-mgi" placeholder="输入消息… Enter发送" rows="1"></textarea>
          <button class="aichat-snd" id="aichat-snd"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg></button>
        </div>
        <div class="aichat-stb" id="aichat-stb">就绪</div>
      </div>`;
    // 事件
    const inp = p.querySelector('#aichat-mgi');
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
    p.querySelector('#aichat-snd').addEventListener('click', sendMessage);
    p.querySelector('#aichat-ccl').addEventListener('click', async () => {
      state.messages = [];
      await saveToStorage('messages', state.messages);
      renderMessages();
    });
    return p;
  }

  function updateChatTopBar() {
    const c = getActiveChar();
    const av = document.getElementById('aichat-cav');
    const nm = document.getElementById('aichat-cnm');
    if (av) av.textContent = c.avatar;
    if (nm) nm.textContent = c.name;
  }

  // ========== 消息发送 ==========
  async function sendMessage() {
    if (state.isStreaming) return;
    const inp = document.getElementById('aichat-mgi');
    if (!inp) return;
    const content = inp.value.trim();
    if (!content) return;
    if (!state.apiConfig || !state.apiConfig.apiKey) {
      document.getElementById('aichat-stb').textContent = '⚠️ 请先配置 API Key（点左侧设置图标）';
      return;
    }
    state.isStreaming = true;
    const snd = document.getElementById('aichat-snd'); if (snd) snd.disabled = true;
    inp.value = ''; inp.style.height = 'auto';

    state.messages.push({ role: 'user', content });
    await saveToStorage('messages', state.messages);
    appendMsg('user', content);
    const typingEl = showTyping();
    setStatus('思考中…');

    try {
      const ac = getActiveChar();
      const msgs = [{ role: 'system', content: ac.systemPrompt }, ...state.messages.slice(-20).map(m => ({ role: m.role, content: m.content }))];
      const resp = await fetch(state.apiConfig.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + state.apiConfig.apiKey },
        body: JSON.stringify({ model: state.apiConfig.model, messages: msgs, max_tokens: state.apiConfig.maxTokens || 2048, temperature: state.apiConfig.temperature || 0.7 })
      });
      if (!resp.ok) { const t = await resp.text(); let m; try { m = JSON.parse(t).error?.message || 'HTTP ' + resp.status; } catch (e) { m = 'HTTP ' + resp.status; } throw new Error(m); }
      const data = await resp.json();
      const reply = data.choices?.[0]?.message?.content || '(空)';
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
      if (snd) snd.disabled = false;
      inp.focus();
    }
  }

  function appendMsg(role, content) {
    const ctr = document.getElementById('aichat-mgc');
    if (!ctr) return;
    const c = getActiveChar();
    const av = role === 'user' ? '🧑' : c.avatar;
    const msg = h('div', { className: 'aichat-mg aichat-mg-' + role, html: '<span class="aichat-mga">' + av + '</span><div class="aichat-mgb">' + esc(content) + '</div>' });
    ctr.appendChild(msg);
    ctr.scrollTop = ctr.scrollHeight;
  }

  function showTyping() {
    const ctr = document.getElementById('aichat-mgc');
    if (!ctr) return null;
    const c = getActiveChar();
    const el = h('div', { className: 'aichat-mg aichat-mg-assistant aichat-ty', html: '<span class="aichat-mga">' + c.avatar + '</span><div class="aichat-mgb"><span class="aichat-dt"></span><span class="aichat-dt"></span><span class="aichat-dt"></span></div>' });
    ctr.appendChild(el); ctr.scrollTop = ctr.scrollHeight;
    return el;
  }

  function renderMessages() {
    const ctr = document.getElementById('aichat-mgc');
    if (!ctr) return;
    ctr.innerHTML = '';
    if (state.messages.length === 0) {
      const c = getActiveChar();
      ctr.innerHTML = '<div class="aichat-wc"><div class="aichat-wci">' + c.avatar + '</div><div>' + c.name + '</div><div style="color:var(--c-t2);font-size:11px">开始对话</div></div>';
    } else {
      state.messages.forEach(m => appendMsg(m.role, m.content));
    }
  }

  function setStatus(t) { const el = document.getElementById('aichat-stb'); if (el) el.textContent = t; }

  // ========== 人物面板 ==========
  function createCharactersPanel() {
    const p = h('div', { id: 'aichat-pnl-characters', className: 'aichat-ip', style: { display: 'none', flexDirection: 'column', height: '100%' } });
    p.innerHTML = `
      <div class="aichat-phd"><span style="font-weight:700">人物管理</span><button class="aichat-cab" id="aichat-cab">+ 添加</button></div>
      <div class="aichat-cgd" id="aichat-cgd"></div>`;
    return p;
  }

  function renderCharacters() {
    const g = document.getElementById('aichat-cgd');
    if (!g || document.getElementById('aichat-cmd')) return;
    g.innerHTML = state.characters.map(c => {
      const act = c.id === state.activeCharId;
      return '<div class="aichat-ccd' + (act ? ' aichat-ccd-a' : '') + '" data-id="' + c.id + '">'
        + '<div class="aichat-ccv">' + c.avatar + '</div>'
        + '<div class="aichat-ccn">' + c.name + '</div>'
        + '<div class="aichat-ccdsc">' + esc(c.description) + '</div>'
        + '<div class="aichat-ccac">'
        + '<button class="aichat-cbtn act" data-act="activate" data-id="' + c.id + '">' + (act ? '✓当前' : '启用') + '</button>'
        + '<button class="aichat-cbtn edt" data-act="edit" data-id="' + c.id + '">编辑</button>'
        + '<button class="aichat-cbtn del" data-act="delete" data-id="' + c.id + '">删除</button>'
        + '</div></div>';
    }).join('');
    g.querySelectorAll('.aichat-cbtn').forEach(b => {
      b.addEventListener('click', async e => {
        e.stopPropagation();
        const act = b.dataset.act, id = b.dataset.id;
        if (act === 'activate') { state.activeCharId = id; await saveToStorage('activeCharId', id); renderCharacters(); updateChatTopBar(); }
        else if (act === 'edit') openCharModal(id);
        else if (act === 'delete') {
          if (state.characters.length <= 1) { alert('至少保留一个角色'); return; }
          if (!confirm('确定删除？')) return;
          state.characters = state.characters.filter(c => c.id !== id);
          await saveToStorage('characters', state.characters);
          if (state.activeCharId === id) { state.activeCharId = state.characters[0].id; await saveToStorage('activeCharId', state.activeCharId); updateChatTopBar(); }
          renderCharacters();
        }
      });
    });
    const ab = document.getElementById('aichat-cab');
    if (ab) ab.onclick = () => openCharModal();
  }

  function openCharModal(id) {
    const ex = document.getElementById('aichat-cmd'); if (ex) ex.remove();
    const ch = id ? state.characters.find(c => c.id === id) : null;
    const isEdit = !!ch;
    const md = h('div', { id: 'aichat-cmd', className: 'aichat-md' });
    md.addEventListener('click', e => { if (e.target === md) md.remove(); });
    const avatars = '🤖|🧑‍⚕️|👨‍💻|🧑‍🏫|🎨|📚|🧠|💡|🔬|🎵|🏋️|🍳|✍️|💻|🌐|🤝|🎯|🔍|📊|🎮|🐱|🐶|🌟|⚡|🔥|💎'.split('|');
    const bx = h('div', { className: 'aichat-mbx' });
    bx.innerHTML = `
      <div class="aichat-mhd"><span>${isEdit ? '编辑人物' : '添加人物'}</span><button class="aichat-mcl">✕</button></div>
      <div class="aichat-mbd">
        <div class="aichat-fg"><label>名称</label><input type="text" id="aichat-cfn" value="${isEdit ? esc(ch.name) : ''}" placeholder="角色名称" /></div>
        <div class="aichat-fg"><label>头像</label><input type="text" id="aichat-cfa" value="${isEdit ? ch.avatar : '🤖'}" maxlength="4" /><div class="aichat-eg">${avatars.map(a => '<span class="aichat-eb">' + a + '</span>').join('')}</div></div>
        <div class="aichat-fg"><label>描述</label><input type="text" id="aichat-cfd" value="${isEdit ? esc(ch.description) : ''}" placeholder="简短描述" /></div>
        <div class="aichat-fg"><label>人设提示词</label><textarea id="aichat-cfp" rows="5" placeholder="描述AI角色的性格...">${isEdit ? esc(ch.systemPrompt) : ''}</textarea></div>
      </div>
      <div class="aichat-mft"><button class="aichat-bo aichat-mcl-btn">取消</button><button class="aichat-bp" id="aichat-cfs">保存</button></div>`;
    md.appendChild(bx); document.body.appendChild(md);
    bx.querySelectorAll('.aichat-eb').forEach(b => b.addEventListener('click', () => { document.getElementById('aichat-cfa').value = b.textContent; }));
    bx.querySelector('.aichat-mcl').onclick = () => md.remove();
    bx.querySelector('.aichat-mcl-btn').onclick = () => md.remove();
    document.getElementById('aichat-cfs').addEventListener('click', async () => {
      const nm = document.getElementById('aichat-cfn').value.trim();
      const av = document.getElementById('aichat-cfa').value.trim() || '🤖';
      const dc = document.getElementById('aichat-cfd').value.trim();
      const pr = document.getElementById('aichat-cfp').value.trim();
      if (!nm || !dc || !pr) { alert('请填写完整'); return; }
      if (isEdit) { const i = state.characters.findIndex(c => c.id === id); if (i !== -1) state.characters[i] = { ...state.characters[i], name: nm, avatar: av, role: 'assistant', description: dc, systemPrompt: pr }; }
      else state.characters.push({ id: 'c_' + Date.now(), name: nm, avatar: av, role: 'assistant', description: dc, systemPrompt: pr });
      await saveToStorage('characters', state.characters);
      md.remove(); renderCharacters(); updateChatTopBar();
    });
  }

  // ========== 设置面板 ==========
  function createSettingsPanel() {
    const p = h('div', { id: 'aichat-pnl-settings', className: 'aichat-ip', style: { display: 'none', flexDirection: 'column', height: '100%' } });
    p.innerHTML = `
      <div class="aichat-phd"><span style="font-weight:700">API 配置</span></div>
      <div class="aichat-sby">
        <div class="aichat-fg"><label>API 地址</label><input type="url" id="aichat-su" placeholder="https://api.openai.com/v1/chat/completions" /></div>
        <div class="aichat-fg"><label>API Key</label><div style="display:flex;gap:6px"><input type="password" id="aichat-sk" placeholder="sk-..." style="flex:1" /><button class="aichat-bo" id="aichat-stk" style="width:38px;padding:0">👁️</button></div></div>
        <div class="aichat-fg"><label>模型</label><input type="text" id="aichat-sm" placeholder="gpt-3.5-turbo" /></div>
        <div class="aichat-fr"><div class="aichat-fg" style="flex:1"><label>Max Tokens</label><input type="number" id="aichat-smt" min="1" max="128000" value="2048" /></div><div class="aichat-fg" style="flex:1"><label>Temperature</label><div style="display:flex;align-items:center;gap:8px"><input type="range" id="aichat-stp" min="0" max="2" step="0.1" value="0.7" style="flex:1" /><span id="aichat-stv" style="min-width:28px;text-align:center">0.7</span></div></div></div>
        <div class="aichat-sac"><button class="aichat-bp" id="aichat-ss">💾 保存</button><button class="aichat-bo" id="aichat-st">🔌 测试连接</button></div>
        <div id="aichat-sr" style="display:none;margin-top:10px;padding:10px;border-radius:8px;font-size:12px"></div>
        <div style="margin-top:16px"><div style="font-size:12px;font-weight:600;margin-bottom:8px">快捷模板</div><div class="aichat-qc"><button class="aichat-qb" data-p="openai">🧠 OpenAI</button><button class="aichat-qb" data-p="deepseek">🔍 DeepSeek</button><button class="aichat-qb" data-p="qwen">☁️ 通义千问</button><button class="aichat-qb" data-p="zhipu">🌌 智谱GLM</button><button class="aichat-qb" data-p="silly">🏰 SillyTavern</button></div></div>
      </div>`;
    return p;
  }

  function renderSettings() {
    const c = state.apiConfig || { apiUrl: '', apiKey: '', model: '', maxTokens: 2048, temperature: 0.7 };
    const sv = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    sv('aichat-su', c.apiUrl); sv('aichat-sk', c.apiKey); sv('aichat-sm', c.model);
    sv('aichat-smt', c.maxTokens);
    const tp = document.getElementById('aichat-stp'); if (tp) { tp.value = c.temperature; document.getElementById('aichat-stv').textContent = c.temperature; }

    const bnd = (id, ev, fn) => { const el = document.getElementById(id); if (el && !el._b) { el.addEventListener(ev, fn); el._b = true; } };
    bnd('aichat-ss', 'click', saveSet);
    bnd('aichat-st', 'click', testConn);
    bnd('aichat-stk', 'click', () => { const i = document.getElementById('aichat-sk'); if (i) { i.type = i.type === 'password' ? 'text' : 'password'; document.getElementById('aichat-stk').textContent = i.type === 'password' ? '👁️' : '🙈'; } });
    const tp2 = document.getElementById('aichat-stp');
    if (tp2 && !tp2._b2) { tp2.addEventListener('input', () => { document.getElementById('aichat-stv').textContent = tp2.value; }); tp2._b2 = true; }
    document.querySelectorAll('.aichat-qb').forEach(b => {
      if (b._b) return; b._b = true;
      b.addEventListener('click', () => {
        const p = QUICK_CONFIGS[b.dataset.p]; if (!p) return;
        const ck = document.getElementById('aichat-sk').value;
        sv('aichat-su', p.apiUrl); sv('aichat-sm', p.model); sv('aichat-smt', p.maxTokens);
        sv('aichat-stp', p.temperature); document.getElementById('aichat-stv').textContent = p.temperature;
        if (ck) sv('aichat-sk', ck);
        showSR('success', '已应用配置（Key已保留）');
      });
    });
  }

  async function saveSet() {
    const c = {
      apiUrl: document.getElementById('aichat-su').value.trim(),
      apiKey: document.getElementById('aichat-sk').value.trim(),
      model: document.getElementById('aichat-sm').value.trim(),
      maxTokens: parseInt(document.getElementById('aichat-smt').value) || 2048,
      temperature: parseFloat(document.getElementById('aichat-stp').value) || 0.7
    };
    state.apiConfig = c; await saveToStorage('apiConfig', c);
    showSR('success', '✅ 已保存');
  }

  async function testConn() {
    const c = { apiUrl: document.getElementById('aichat-su').value.trim(), apiKey: document.getElementById('aichat-sk').value.trim(), model: document.getElementById('aichat-sm').value.trim() };
    if (!c.apiUrl || !c.apiKey) { showSR('error', '请填写地址和Key'); return; }
    showSR('loading', '⏳ 测试中…');
    try {
      const r = await fetch(c.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.apiKey }, body: JSON.stringify({ model: c.model, messages: [{ role: 'user', content: 'Say OK' }], max_tokens: 5 }) });
      if (r.ok) { showSR('success', '✅ 连接成功！'); await saveSet(); }
      else { const t = await r.text(); let m; try { m = JSON.parse(t).error?.message || 'HTTP ' + r.status; } catch (e) { m = 'HTTP ' + r.status; } showSR('error', '❌ ' + m); }
    } catch (e) { showSR('error', '❌ 网络错误: ' + e.message); }
  }

  function showSR(type, msg) {
    const el = document.getElementById('aichat-sr'); if (!el) return;
    el.style.display = 'block'; el.className = ''; el.classList.add('aichat-srt', 'aichat-srt-' + type); el.textContent = msg;
    setTimeout(() => { el.style.display = 'none'; }, 4000);
  }

  // ========== 打开/关闭 ==========
  function togglePanel() { if (state.panelOpen) closePanel(); else openPanel(); }
  function openPanel() {
    if (!document.getElementById('aichat-ov')) { createPanel(); updateChatTopBar(); renderMessages(); }
    state.panelOpen = true;
    const o = document.getElementById('aichat-ov'), p = document.getElementById('aichat-pn');
    if (o) { o.style.display = 'flex'; setTimeout(() => o.classList.add('aichat-ov-o'), 10); }
    if (p) p.classList.add('aichat-pn-o');
    document.getElementById('aichat-fb').style.display = 'none';
    if (state.activeTab === 'characters') renderCharacters();
    if (state.activeTab === 'settings') renderSettings();
  }
  function closePanel() {
    state.panelOpen = false;
    const o = document.getElementById('aichat-ov'), p = document.getElementById('aichat-pn');
    if (o) o.classList.remove('aichat-ov-o');
    if (p) p.classList.remove('aichat-pn-o');
    setTimeout(() => { if (o) o.style.display = 'none'; }, 300);
    const fb = document.getElementById('aichat-fb'); if (fb) fb.style.display = 'flex';
  }

  // ========== 工具 ==========
  function esc(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
  function removeEl(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }

  // ========== CSS 注入 ==========
  function injectCSS() {
    const css = `
.aichat-fb{position:fixed;bottom:24px;right:24px;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#e94560,#ff6b81);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:2147483646;box-shadow:0 4px 20px rgba(233,69,96,.4);transition:transform .2s,box-shadow .2s;user-select:none;font-family:sans-serif}
.aichat-fb:hover{transform:scale(1.1);box-shadow:0 6px 28px rgba(233,69,96,.6)}
.aichat-ov{display:none;position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0);transition:background .3s cubic-bezier(.4,0,.2,1)}
.aichat-ov.aichat-ov-o{display:flex;background:rgba(0,0,0,.4)}
.aichat-pn{position:fixed;top:4vh;right:0;height:92vh;background:#0f0f1a;border:1px solid #2a2a4a;border-right:none;border-radius:16px 0 0 16px;box-shadow:0 8px 40px rgba(0,0,0,.5);display:flex;z-index:2147483647;transform:translateX(100%);transition:transform .3s cubic-bezier(.4,0,.2,1);overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.aichat-pn.aichat-pn-o{transform:translateX(0)}
.aichat-sb{width:52px;display:flex;flex-direction:column;align-items:center;padding:10px 0;gap:4px;background:#1a1a2e;border-right:1px solid #2a2a4a;flex-shrink:0}
.aichat-nb{width:42px;height:42px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;border-radius:10px;cursor:pointer;color:#888;transition:all .2s;user-select:none}
.aichat-nb:hover{color:#e0e0e0;background:rgba(255,255,255,.05)}
.aichat-nb.aichat-nb-a{color:#e94560;background:rgba(233,69,96,.12)}
.aichat-nbl{font-size:9px;line-height:1}
.aichat-ct{flex:1;display:flex;flex-direction:column;min-width:0;overflow:hidden;position:relative}
.aichat-ip{width:100%;height:100%;overflow:hidden}
.aichat-cl{position:absolute;top:10px;right:12px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:50%;color:#888;cursor:pointer;font-size:15px;z-index:10;transition:all .15s}
.aichat-cl:hover{color:#e0e0e0;background:rgba(255,255,255,.08)}
.aichat-ctb{display:flex;align-items:center;gap:8px;padding:10px 14px;background:#1a1a2e;border-bottom:1px solid #2a2a4a;flex-shrink:0}
.aichat-cav{font-size:20px}
.aichat-cnm{font-size:13px;font-weight:600;flex:1;color:#e0e0e0}
.aichat-ccl{width:26px;height:26px;border:none;border-radius:6px;background:transparent;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;color:#888;transition:all .15s}
.aichat-ccl:hover{background:rgba(233,69,96,.12)}
.aichat-mgc{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px}
.aichat-mgc::-webkit-scrollbar{width:4px}
.aichat-mgc::-webkit-scrollbar-track{background:transparent}
.aichat-mgc::-webkit-scrollbar-thumb{background:#2a2a4a;border-radius:4px}
.aichat-mg{display:flex;gap:8px;animation:aifd .25s ease}
.aichat-mg-user{flex-direction:row-reverse}
@keyframes aifd{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.aichat-mga{font-size:18px;flex-shrink:0;line-height:1;margin-top:2px}
.aichat-mgb{max-width:76%;padding:9px 13px;border-radius:14px;font-size:12px;line-height:1.55;word-break:break-word;white-space:pre-wrap}
.aichat-mg-user .aichat-mgb{background:#e94560;color:#fff;border-bottom-right-radius:4px}
.aichat-mg-assistant .aichat-mgb{background:#1a1a2e;border:1px solid #2a2a4a;color:#e0e0e0;border-bottom-left-radius:4px}
.aichat-ty .aichat-mgb{display:flex;gap:4px;align-items:center;padding:12px 16px}
.aichat-dt{width:5px;height:5px;border-radius:50%;background:#888;animation:aibc 1.4s infinite ease-in-out both}
.aichat-dt:nth-child(1){animation-delay:-.32s}
.aichat-dt:nth-child(2){animation-delay:-.16s}
@keyframes aibc{0%,80%,100%{transform:scale(0)}40%{transform:scale(1)}}
.aichat-wc{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:#888}
.aichat-wci{font-size:48px}
.aichat-ina{flex-shrink:0;padding:10px 12px 10px;background:#1a1a2e;border-top:1px solid #2a2a4a}
.aichat-inr{display:flex;gap:6px;align-items:flex-end}
.aichat-mgi{flex:1;padding:9px 12px;border:1px solid #2a2a4a;border-radius:16px;background:#0d0d20;color:#e0e0e0;font-size:12px;line-height:1.4;resize:none;outline:none;max-height:100px;font-family:inherit;transition:border-color .2s}
.aichat-mgi:focus{border-color:#e94560}
.aichat-mgi::placeholder{color:#888}
.aichat-snd{width:34px;height:34px;border-radius:50%;border:none;background:#e94560;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s}
.aichat-snd:hover{background:#ff6b81;transform:scale(1.05)}
.aichat-snd:disabled{opacity:.5;cursor:not-allowed;transform:none}
.aichat-stb{text-align:center;padding-top:5px;font-size:10px;color:#888}
.aichat-phd{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #2a2a4a;flex-shrink:0;color:#e0e0e0}
.aichat-cab{padding:5px 12px;border:none;border-radius:6px;background:#e94560;color:#fff;font-size:11px;font-weight:600;cursor:pointer;transition:background .2s;font-family:inherit}
.aichat-cab:hover{background:#ff6b81}
.aichat-cgd{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px}
.aichat-cgd::-webkit-scrollbar{width:4px}
.aichat-cgd::-webkit-scrollbar-track{background:transparent}
.aichat-cgd::-webkit-scrollbar-thumb{background:#2a2a4a;border-radius:4px}
.aichat-ccd{background:#1a1a2e;border:1px solid #2a2a4a;border-radius:10px;padding:12px;transition:all .2s;display:flex;align-items:center;gap:10px}
.aichat-ccd:hover{border-color:#e94560}
.aichat-ccd.aichat-ccd-a{border-color:#00b894}
.aichat-ccv{font-size:28px;flex-shrink:0}
.aichat-ccn{font-size:13px;font-weight:700;color:#e0e0e0}
.aichat-ccdsc{flex:1;font-size:10px;color:#888;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aichat-ccac{display:flex;gap:3px;flex-shrink:0}
.aichat-cbtn{padding:4px 9px;border:1px solid #2a2a4a;border-radius:5px;font-size:10px;cursor:pointer;background:transparent;color:#888;transition:all .15s;font-family:inherit}
.aichat-cbtn:hover{background:#2a2a4a;color:#e0e0e0}
.aichat-cbtn.act{border-color:#00b894;color:#00b894}
.aichat-cbtn.act:hover{background:rgba(0,184,148,.1)}
.aichat-cbtn.del:hover{border-color:#e94560;color:#e94560;background:rgba(233,69,96,.1)}
.aichat-sby{flex:1;overflow-y:auto;padding:12px 14px}
.aichat-sby::-webkit-scrollbar{width:4px}
.aichat-sby::-webkit-scrollbar-track{background:transparent}
.aichat-sby::-webkit-scrollbar-thumb{background:#2a2a4a;border-radius:4px}
.aichat-fg{margin-bottom:12px}
.aichat-fg label{display:block;font-size:11px;font-weight:600;margin-bottom:4px;color:#e0e0e0}
.aichat-fg input,.aichat-fg textarea,.aichat-fg select{width:100%;padding:8px 11px;border:1px solid #2a2a4a;border-radius:7px;background:#0d0d20;color:#e0e0e0;font-size:12px;outline:none;font-family:inherit;transition:border-color .2s;box-sizing:border-box}
.aichat-fg input:focus,.aichat-fg textarea:focus{border-color:#e94560}
.aichat-fg input::placeholder{color:#888}
.aichat-fg textarea{resize:vertical;min-height:60px;line-height:1.4}
.aichat-fr{display:flex;gap:10px}
.aichat-sac{display:flex;gap:6px;margin-top:2px;flex-wrap:wrap}
.aichat-bp{padding:8px 16px;border:none;border-radius:7px;background:#e94560;color:#fff;font-size:12px;font-weight:600;cursor:pointer;transition:all .2s;font-family:inherit}
.aichat-bp:hover{background:#ff6b81}
.aichat-bo{padding:7px 14px;border:1px solid #2a2a4a;border-radius:7px;background:transparent;color:#e0e0e0;font-size:12px;cursor:pointer;transition:all .2s;font-family:inherit}
.aichat-bo:hover{background:#1a1a2e;border-color:#888}
.aichat-qc{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.aichat-qb{padding:7px;border:1px solid #2a2a4a;border-radius:7px;background:transparent;color:#888;font-size:11px;cursor:pointer;transition:all .15s;font-family:inherit}
.aichat-qb:hover{border-color:#e94560;color:#e0e0e0}
.aichat-srt{font-size:11px;line-height:1.5}
.aichat-srt-success{padding:9px 12px!important;background:rgba(0,184,148,.1);border:1px solid #00b894;color:#00b894;border-radius:7px!important}
.aichat-srt-error{padding:9px 12px!important;background:rgba(233,69,96,.1);border:1px solid #e94560;color:#e94560;border-radius:7px!important}
.aichat-srt-loading{padding:9px 12px!important;background:rgba(255,255,255,.03);border:1px solid #2a2a4a;color:#888;border-radius:7px!important}
.aichat-md{position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:2147483648;backdrop-filter:blur(3px);animation:aimin .2s ease}
@keyframes aimin{from{opacity:0}to{opacity:1}}
.aichat-mbx{background:#0f0f1a;border:1px solid #2a2a4a;border-radius:14px;width:380px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 12px 48px rgba(0,0,0,.6);animation:aims .25s ease}
@keyframes aims{from{transform:scale(.95) translateY(10px);opacity:0}to{transform:scale(1);opacity:1}}
.aichat-mhd{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #2a2a4a;font-weight:700;font-size:14px;color:#e0e0e0}
.aichat-mcl{width:26px;height:26px;border:none;border-radius:6px;background:transparent;color:#888;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.aichat-mcl:hover{background:rgba(255,255,255,.06);color:#e0e0e0}
.aichat-mbd{padding:14px 16px;overflow-y:auto;flex:1}
.aichat-mbd::-webkit-scrollbar{width:4px}
.aichat-mbd::-webkit-scrollbar-track{background:transparent}
.aichat-mbd::-webkit-scrollbar-thumb{background:#2a2a4a;border-radius:4px}
.aichat-mft{display:flex;justify-content:flex-end;gap:6px;padding:10px 16px;border-top:1px solid #2a2a4a}
.aichat-eg{display:flex;flex-wrap:wrap;gap:3px;margin-top:5px}
.aichat-eb{width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:15px;border-radius:6px;cursor:pointer;border:1px solid transparent;transition:all .15s;color:#e0e0e0}
.aichat-eb:hover{background:#2a2a4a;border-color:#e94560}
input[type=range]{accent-color:#e94560}
`;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ========== 启动 ==========
  async function init() {
    injectCSS();
    await loadFromStorage();
    createFloatBall();

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && state.panelOpen) {
        const md = document.getElementById('aichat-cmd'); if (md) { md.remove(); return; }
        closePanel();
      }
    });
  }

  init();
})();
