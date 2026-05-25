// ============================================================================
//  AI Chat Assistant — 纯 ES 模块
//  托管到 GitHub 后，一行 import 即可注入任意网页
//
//  用法 1 - ES Module import：
//    import 'https://raw.xxx.github.com/you/ai-chat.js'
//
//  用法 2 - 浏览器控制台注入：
//    const s=document.createElement('script');s.type='module';s.src='https://xxx/ai-chat.js';document.head.appendChild(s);
//
//  用法 3 - 动态 import：
//    import('https://xxx/ai-chat.js').then(m=>m.init())
//
//  用法 4 - CDN importmap：
//    <script type="importmap">{ "imports": { "aichat": "https://xxx/ai-chat.js" } }</script>
//    <script type="module">import 'aichat'</script>
// ============================================================================

// ───────── 配置 ─────────
const CONF = {
  PANEL_WIDTH: 420,
  FLOAT_SIZE: 56
};

const DEFAULT_CHARACTERS = [
  { id: 'assistant', name: '通用助手',    avatar: '🤖', role: 'assistant', description: '友好、乐于助人的AI助手',         systemPrompt: '你是一个友好、乐于助人的AI助手。请用清晰、简洁的方式回答用户的问题。' },
  { id: 'coder',      name: '编程导师',    avatar: '💻', role: 'assistant', description: '代码讲解、调试与最佳实践',      systemPrompt: '你是一位经验丰富的编程导师。用通俗易懂的方式讲解概念，帮助调试代码，提供最佳实践建议。回答时附上代码示例。' },
  { id: 'translator', name: '翻译专家',    avatar: '🌐', role: 'assistant', description: '专业多语言翻译',               systemPrompt: '你是一位专业翻译专家，精通中英日韩等语言。准确地道翻译，解释文化差异和语境。' },
  { id: 'writer',     name: '创意写手',    avatar: '✍️', role: 'assistant', description: '各类文案创意写作',               systemPrompt: '你是一位创意写作助手，擅长文章、故事、诗歌、文案等。请提供有创意、有感染力的文字。' }
];

const QUICK_CONFIGS = {
  openai:   { apiUrl: 'https://api.openai.com/v1/chat/completions',            model: 'gpt-4o',             maxTokens: 4096, temperature: 0.7 },
  deepseek: { apiUrl: 'https://api.deepseek.com/v1/chat/completions',          model: 'deepseek-chat',       maxTokens: 4096, temperature: 0.7 },
  qwen:     { apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-turbo',       maxTokens: 2048, temperature: 0.7 },
  zhipu:    { apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash',          maxTokens: 4096, temperature: 0.7 },
  silly:    { apiUrl: 'http://127.0.0.1:8000/v1/chat/completions',             model: 'gpt-3.5-turbo',       maxTokens: 4096, temperature: 0.7 }
};

// ───────── 持久化（localStorage）─────────
const LS = {
  get(k)     { try { return JSON.parse(localStorage.getItem('aichat_' + k)); } catch (e) { return null; } },
  set(k, v)  { try { localStorage.setItem('aichat_' + k, JSON.stringify(v)); } catch (e) {} },
  remove(k)  { try { localStorage.removeItem('aichat_' + k); } catch (e) {} }
};

// ───────── 状态 ─────────
const S = {
  open: false,
  tab: 'chat',                     // 'chat' | 'characters' | 'settings'
  chars: LS.get('chars') || [...DEFAULT_CHARACTERS],
  active: LS.get('active') || 'assistant',
  msgs: LS.get('msgs') || [],
  streaming: false,
  api: LS.get('api') || { apiUrl: 'https://api.openai.com/v1/chat/completions', apiKey: '', model: 'gpt-3.5-turbo', maxTokens: 2048, temperature: 0.7 }
};

function activeChar() { return S.chars.find(c => c.id === S.active) || S.chars[0]; }
function persist(k)  { LS.set('chars', S.chars); LS.set('active', S.active); LS.set('msgs', S.msgs); LS.set('api', S.api); }
function esc(t)     { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
function rm(el)     { if (el && el.parentNode) el.parentNode.removeChild(el); }

// ───────── DOM 快捷 ─────────
function el(tag, attrs) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'c') e.className = v;
    else if (k === 'h') e.innerHTML = v;
    else if (k === 't') e.textContent = v;
    else if (k === 's') Object.assign(e.style, v);
    else if (k[0] === 'o' && k[1] === 'n') e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  }
  return e;
}

// ───────── CSS 注入 ─────────
function injectCSS() {
  if (document.getElementById('aichat-css')) return;
  const css = document.createElement('style');
  css.id = 'aichat-css';
  css.textContent = `
.aic-fb{position:fixed;bottom:24px;right:24px;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#e94560,#ff6b81);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:2147483646;box-shadow:0 4px 20px rgba(233,69,96,.4);transition:transform .2s,box-shadow .2s;user-select:none;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
.aic-fb:hover{transform:scale(1.1);box-shadow:0 6px 28px rgba(233,69,96,.6)}
.aic-ov{display:none;position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0);transition:background .3s cubic-bezier(.4,0,.2,1)}
.aic-ov.on{display:flex;background:rgba(0,0,0,.4)}
.aic-pn{position:fixed;top:4vh;right:0;height:92vh;background:#0f0f1a;border:1px solid #2a2a4a;border-right:none;border-radius:16px 0 0 16px;box-shadow:0 8px 40px rgba(0,0,0,.5);display:flex;z-index:2147483647;transform:translateX(100%);transition:transform .3s cubic-bezier(.4,0,.2,1);overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.aic-pn.on{transform:translateX(0)}
.aic-sb{width:52px;display:flex;flex-direction:column;align-items:center;padding:10px 0;gap:4px;background:#1a1a2e;border-right:1px solid #2a2a4a;flex-shrink:0}
.aic-nb{width:42px;height:42px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;border-radius:10px;cursor:pointer;color:#888;transition:all .2s;user-select:none}
.aic-nb:hover{color:#e0e0e0;background:rgba(255,255,255,.05)}
.aic-nb.ac{color:#e94560;background:rgba(233,69,96,.12)}
.aic-nbl{font-size:9px;line-height:1}
.aic-ct{flex:1;display:flex;flex-direction:column;min-width:0;overflow:hidden;position:relative}
.aic-ip{width:100%;height:100%;overflow:hidden}
.aic-cl{position:absolute;top:10px;right:12px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:50%;color:#888;cursor:pointer;font-size:15px;z-index:10;transition:all .15s}
.aic-cl:hover{color:#e0e0e0;background:rgba(255,255,255,.08)}
.aic-ctb{display:flex;align-items:center;gap:8px;padding:10px 14px;background:#1a1a2e;border-bottom:1px solid #2a2a4a;flex-shrink:0}
.aic-cav{font-size:20px;color:#e0e0e0}
.aic-cnm{font-size:13px;font-weight:600;flex:1;color:#e0e0e0}
.aic-ccl{width:26px;height:26px;border:none;border-radius:6px;background:transparent;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;color:#888;transition:all .15s}
.aic-ccl:hover{background:rgba(233,69,96,.12)}
.aic-mgc{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px}
.aic-mgc::-webkit-scrollbar{width:4px}
.aic-mgc::-webkit-scrollbar-track{background:transparent}
.aic-mgc::-webkit-scrollbar-thumb{background:#2a2a4a;border-radius:4px}
.aic-mg{display:flex;gap:8px;animation:aifd .25s ease}
.aic-mg-u{flex-direction:row-reverse}
@keyframes aifd{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.aic-mga{font-size:18px;flex-shrink:0;line-height:1;margin-top:2px}
.aic-mgb{max-width:76%;padding:9px 13px;border-radius:14px;font-size:12px;line-height:1.55;word-break:break-word;white-space:pre-wrap}
.aic-mg-u .aic-mgb{background:#e94560;color:#fff;border-bottom-right-radius:4px}
.aic-mg-a .aic-mgb{background:#1a1a2e;border:1px solid #2a2a4a;color:#e0e0e0;border-bottom-left-radius:4px}
.aic-ty .aic-mgb{display:flex;gap:4px;align-items:center;padding:12px 16px}
.aic-dt{width:5px;height:5px;border-radius:50%;background:#888;animation:aibc 1.4s infinite ease-in-out both}
.aic-dt:nth-child(1){animation-delay:-.32s}
.aic-dt:nth-child(2){animation-delay:-.16s}
@keyframes aibc{0%,80%,100%{transform:scale(0)}40%{transform:scale(1)}}
.aic-wc{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:#888}
.aic-wci{font-size:48px}
.aic-ina{flex-shrink:0;padding:10px 12px;background:#1a1a2e;border-top:1px solid #2a2a4a}
.aic-inr{display:flex;gap:6px;align-items:flex-end}
.aic-mgi{flex:1;padding:9px 12px;border:1px solid #2a2a4a;border-radius:16px;background:#0d0d20;color:#e0e0e0;font-size:12px;line-height:1.4;resize:none;outline:none;max-height:100px;font-family:inherit;transition:border-color .2s}
.aic-mgi:focus{border-color:#e94560}
.aic-mgi::placeholder{color:#888}
.aic-snd{width:34px;height:34px;border-radius:50%;border:none;background:#e94560;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s}
.aic-snd:hover{background:#ff6b81;transform:scale(1.05)}
.aic-snd:disabled{opacity:.5;cursor:not-allowed;transform:none}
.aic-stb{text-align:center;padding-top:5px;font-size:10px;color:#888}
.aic-phd{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #2a2a4a;flex-shrink:0;color:#e0e0e0}
.aic-cab{padding:5px 12px;border:none;border-radius:6px;background:#e94560;color:#fff;font-size:11px;font-weight:600;cursor:pointer;transition:background .2s;font-family:inherit}
.aic-cab:hover{background:#ff6b81}
.aic-cgd{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px}
.aic-cgd::-webkit-scrollbar{width:4px}
.aic-cgd::-webkit-scrollbar-track{background:transparent}
.aic-cgd::-webkit-scrollbar-thumb{background:#2a2a4a;border-radius:4px}
.aic-ccd{background:#1a1a2e;border:1px solid #2a2a4a;border-radius:10px;padding:12px;transition:all .2s;display:flex;align-items:center;gap:10px}
.aic-ccd:hover{border-color:#e94560}
.aic-ccd.ac{border-color:#00b894}
.aic-ccv{font-size:28px;flex-shrink:0}
.aic-ccn{font-size:13px;font-weight:700;color:#e0e0e0}
.aic-ccdsc{flex:1;font-size:10px;color:#888;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aic-ccac{display:flex;gap:3px;flex-shrink:0}
.aic-cbtn{padding:4px 9px;border:1px solid #2a2a4a;border-radius:5px;font-size:10px;cursor:pointer;background:transparent;color:#888;transition:all .15s;font-family:inherit}
.aic-cbtn:hover{background:#2a2a4a;color:#e0e0e0}
.aic-cbtn.ac2{border-color:#00b894;color:#00b894}
.aic-cbtn.ac2:hover{background:rgba(0,184,148,.1)}
.aic-cbtn.dl:hover{border-color:#e94560;color:#e94560;background:rgba(233,69,96,.1)}
.aic-sby{flex:1;overflow-y:auto;padding:12px 14px}
.aic-sby::-webkit-scrollbar{width:4px}
.aic-sby::-webkit-scrollbar-track{background:transparent}
.aic-sby::-webkit-scrollbar-thumb{background:#2a2a4a;border-radius:4px}
.aic-fg{margin-bottom:12px}
.aic-fg label{display:block;font-size:11px;font-weight:600;margin-bottom:4px;color:#e0e0e0}
.aic-fg input,.aic-fg textarea,.aic-fg select{width:100%;padding:8px 11px;border:1px solid #2a2a4a;border-radius:7px;background:#0d0d20;color:#e0e0e0;font-size:12px;outline:none;font-family:inherit;transition:border-color .2s;box-sizing:border-box}
.aic-fg input:focus,.aic-fg textarea:focus{border-color:#e94560}
.aic-fg input::placeholder{color:#888}
.aic-fg textarea{resize:vertical;min-height:60px;line-height:1.4}
.aic-fr{display:flex;gap:10px}
.aic-sac{display:flex;gap:6px;margin-top:2px;flex-wrap:wrap}
.aic-bp{padding:8px 16px;border:none;border-radius:7px;background:#e94560;color:#fff;font-size:12px;font-weight:600;cursor:pointer;transition:all .2s;font-family:inherit}
.aic-bp:hover{background:#ff6b81}
.aic-bo{padding:7px 14px;border:1px solid #2a2a4a;border-radius:7px;background:transparent;color:#e0e0e0;font-size:12px;cursor:pointer;transition:all .2s;font-family:inherit}
.aic-bo:hover{background:#1a1a2e;border-color:#888}
.aic-qc{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.aic-qb{padding:7px;border:1px solid #2a2a4a;border-radius:7px;background:transparent;color:#888;font-size:11px;cursor:pointer;transition:all .15s;font-family:inherit}
.aic-qb:hover{border-color:#e94560;color:#e0e0e0}
.aic-srt{font-size:11px;line-height:1.5}
.aic-srt.ok{padding:9px 12px!important;background:rgba(0,184,148,.1);border:1px solid #00b894;color:#00b894;border-radius:7px!important}
.aic-srt.er{padding:9px 12px!important;background:rgba(233,69,96,.1);border:1px solid #e94560;color:#e94560;border-radius:7px!important}
.aic-srt.ld{padding:9px 12px!important;background:rgba(255,255,255,.03);border:1px solid #2a2a4a;color:#888;border-radius:7px!important}
.aic-md{position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:2147483648;backdrop-filter:blur(3px);animation:aimin .2s ease}
@keyframes aimin{from{opacity:0}to{opacity:1}}
.aic-mbx{background:#0f0f1a;border:1px solid #2a2a4a;border-radius:14px;width:380px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 12px 48px rgba(0,0,0,.6);animation:aims .25s ease}
@keyframes aims{from{transform:scale(.95) translateY(10px);opacity:0}to{transform:scale(1);opacity:0}}
.aic-mhd{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #2a2a4a;font-weight:700;font-size:14px;color:#e0e0e0}
.aic-mcl{width:26px;height:26px;border:none;border-radius:6px;background:transparent;color:#888;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.aic-mcl:hover{background:rgba(255,255,255,.06);color:#e0e0e0}
.aic-mbd{padding:14px 16px;overflow-y:auto;flex:1}
.aic-mbd::-webkit-scrollbar{width:4px}
.aic-mbd::-webkit-scrollbar-track{background:transparent}
.aic-mbd::-webkit-scrollbar-thumb{background:#2a2a4a;border-radius:4px}
.aic-mft{display:flex;justify-content:flex-end;gap:6px;padding:10px 16px;border-top:1px solid #2a2a4a}
.aic-eg{display:flex;flex-wrap:wrap;gap:3px;margin-top:5px}
.aic-eb{width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:15px;border-radius:6px;cursor:pointer;border:1px solid transparent;transition:all .15s;color:#e0e0e0}
.aic-eb:hover{background:#2a2a4a;border-color:#e94560}
input[type=range]{accent-color:#e94560}
`;
  document.head.appendChild(css);
}

// ───────── 悬浮球 ─────────
function createBall() {
  const b = el('div', {
    id: 'aic-b', c: 'aic-fb',
    h: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
    onclick: togglePanel
  });
  document.body.appendChild(b);

  let wasDrag = false, sx, sy;
  b.addEventListener('mousedown', e => { if (e.button !== 0) return; wasDrag = false; const r = b.getBoundingClientRect(); sx = e.clientX - r.left; sy = e.clientY - r.top; });
  b.addEventListener('mousemove', e => {
    if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) wasDrag = true;
    if (wasDrag) {
      b.style.left = Math.min(window.innerWidth - CONF.FLOAT_SIZE - 10, Math.max(10, e.clientX - sx)) + 'px';
      b.style.top  = Math.min(window.innerHeight - CONF.FLOAT_SIZE - 10, Math.max(10, e.clientY - sy)) + 'px';
      b.style.right = 'auto'; b.style.bottom = 'auto';
    }
  });
  b.addEventListener('click', e => { if (wasDrag) { e.stopPropagation(); e.preventDefault(); } }, true);
}

// ───────── 导航图标（内联 SVG）─────────
const ICONS = {
  chat:       '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
  characters: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
  settings:   '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>'
};
const NAV_LABELS = { chat: '聊天', characters: '人物', settings: '设置' };

// ───────── 创建面板 ─────────
function createPanel() {
  const ov = el('div', { id: 'aic-ov', c: 'aic-ov', onclick: closePanel });
  const pn = el('div', { id: 'aic-pn', c: 'aic-pn', s: { width: CONF.PANEL_WIDTH + 'px' } });

  // 侧边导航
  const sb = el('div', { c: 'aic-sb' });
  ['chat', 'characters', 'settings'].forEach(id => {
    sb.appendChild(el('div', {
      c: 'aic-nb' + (S.tab === id ? ' ac' : ''),
      h: ICONS[id] + '<span class="aic-nbl">' + NAV_LABELS[id] + '</span>',
      onclick: () => switchTab(id)
    }));
  });
  pn.appendChild(sb);

  // 内容区
  const ct = el('div', { c: 'aic-ct' });
  ct.appendChild(chatPanel());
  ct.appendChild(charsPanel());
  ct.appendChild(settingsPanel());
  pn.appendChild(ct);

  // 关闭按钮
  pn.appendChild(el('div', { c: 'aic-cl', h: '✕', onclick: closePanel }));

  ov.appendChild(pn);
  document.body.appendChild(ov);
  showTab(S.tab);
}

// ───────── 聊天面板 ─────────
function chatPanel() {
  const p = el('div', { id: 'aic-pl-chat', c: 'aic-ip', s: { display: 'flex', flexDirection: 'column', height: '100%' } });
  p.innerHTML = `
    <div class="aic-ctb"><span class="aic-cav" id="aic-cav">🤖</span><span class="aic-cnm" id="aic-cnm">通用助手</span><button class="aic-ccl" id="aic-ccl" title="清空">🗑️</button></div>
    <div class="aic-mgc" id="aic-mgc"></div>
    <div class="aic-ina">
      <div class="aic-inr">
        <textarea class="aic-mgi" id="aic-mgi" placeholder="输入消息… Enter发送" rows="1"></textarea>
        <button class="aic-snd" id="aic-snd"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg></button>
      </div>
      <div class="aic-stb" id="aic-stb">就绪</div>
    </div>`;
  p.querySelector('#aic-mgi').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } });
  p.querySelector('#aic-snd').addEventListener('click', sendMsg);
  p.querySelector('#aic-ccl').addEventListener('click', () => { S.msgs = []; persist('msgs'); renderMsgs(); });
  return p;
}

// ───────── 人物面板 ─────────
function charsPanel() {
  const p = el('div', { id: 'aic-pl-chars', c: 'aic-ip', s: { display: 'none', flexDirection: 'column', height: '100%' } });
  p.innerHTML = `
    <div class="aic-phd"><span style="font-weight:700">人物管理</span><button class="aic-cab" id="aic-cab">+ 添加</button></div>
    <div class="aic-cgd" id="aic-cgd"></div>`;
  return p;
}

// ───────── 设置面板 ─────────
function settingsPanel() {
  const p = el('div', { id: 'aic-pl-sets', c: 'aic-ip', s: { display: 'none', flexDirection: 'column', height: '100%' } });
  p.innerHTML = `
    <div class="aic-phd"><span style="font-weight:700">API 配置</span></div>
    <div class="aic-sby">
      <div class="aic-fg"><label>API 地址</label><input type="url" id="aic-su" placeholder="https://api.openai.com/v1/chat/completions" /></div>
      <div class="aic-fg"><label>API Key</label><div style="display:flex;gap:6px"><input type="password" id="aic-sk" placeholder="sk-..." style="flex:1" /><button class="aic-bo" id="aic-stk" style="width:38px;padding:0">👁️</button></div></div>
      <div class="aic-fg"><label>模型</label><input type="text" id="aic-sm" placeholder="gpt-3.5-turbo" /></div>
      <div class="aic-fr"><div class="aic-fg" style="flex:1"><label>Max Tokens</label><input type="number" id="aic-smt" min="1" max="128000" value="2048" /></div><div class="aic-fg" style="flex:1"><label>Temperature</label><div style="display:flex;align-items:center;gap:8px"><input type="range" id="aic-stp" min="0" max="2" step="0.1" value="0.7" style="flex:1" /><span id="aic-stv" style="min-width:28px;text-align:center">0.7</span></div></div></div>
      <div class="aic-sac"><button class="aic-bp" id="aic-ss">💾 保存</button><button class="aic-bo" id="aic-st">🔌 测试连接</button></div>
      <div id="aic-sr" style="display:none;margin-top:10px;padding:10px;border-radius:8px;font-size:12px"></div>
      <div style="margin-top:16px"><div style="font-size:12px;font-weight:600;margin-bottom:8px">快捷模板</div><div class="aic-qc"><button class="aic-qb" data-p="openai">🧠 OpenAI</button><button class="aic-qb" data-p="deepseek">🔍 DeepSeek</button><button class="aic-qb" data-p="qwen">☁️ 通义千问</button><button class="aic-qb" data-p="zhipu">🌌 智谱GLM</button><button class="aic-qb" data-p="silly">🏰 SillyTavern</button></div></div>
    </div>`;
  return p;
}

// ───────── 切换面板 ─────────
function switchTab(id) {
  S.tab = id;
  document.querySelectorAll('.aic-nb').forEach((b, i) => b.classList.toggle('ac', ['chat','characters','settings'][i] === id));
  showTab(id);
  if (id === 'chat') renderMsgs();
  if (id === 'characters') renderChars();
  if (id === 'settings') renderSets();
}

function showTab(id) {
  ['chat','chars','sets'].forEach(k => { const e = document.getElementById('aic-pl-' + k); if (e) e.style.display = k === id ? 'flex' : 'none'; });
}

// ───────── 消息 ─────────
function renderMsgs() {
  const c = document.getElementById('aic-mgc'); if (!c) return;
  c.innerHTML = '';
  if (!S.msgs.length) { c.innerHTML = '<div class="aic-wc"><div class="aic-wci">' + activeChar().avatar + '</div><div>' + activeChar().name + '</div><div style="color:#888;font-size:11px">开始对话</div></div>'; return; }
  S.msgs.forEach(m => appendMsg(m.role, m.content));
}

function appendMsg(role, content) {
  const c = document.getElementById('aic-mgc'); if (!c) return;
  const av = role === 'user' ? '🧑' : activeChar().avatar;
  const cls = role === 'user' ? 'aic-mg aic-mg-u' : 'aic-mg aic-mg-a';
  const msg = el('div', { c: cls, h: '<span class="aic-mga">' + av + '</span><div class="aic-mgb">' + esc(content) + '</div>' });
  c.appendChild(msg); c.scrollTop = c.scrollHeight;
}

function showTyping() {
  const c = document.getElementById('aic-mgc'); if (!c) return null;
  const el_ = el('div', { c: 'aic-mg aic-mg-a aic-ty', h: '<span class="aic-mga">' + activeChar().avatar + '</span><div class="aic-mgb"><span class="aic-dt"></span><span class="aic-dt"></span><span class="aic-dt"></span></div>' });
  c.appendChild(el_); c.scrollTop = c.scrollHeight;
  return el_;
}

function setStatus(t) { const e = document.getElementById('aic-stb'); if (e) e.textContent = t; }

// ───────── 发送消息 ─────────
async function sendMsg() {
  if (S.streaming) return;
  const inp = document.getElementById('aic-mgi'); if (!inp) return;
  const content = inp.value.trim(); if (!content) return;
  if (!S.api || !S.api.apiKey) { setStatus('⚠️ 请先配置 API Key'); return; }

  S.streaming = true;
  const snd = document.getElementById('aic-snd'); if (snd) snd.disabled = true;
  inp.value = ''; inp.style.height = 'auto';

  S.msgs.push({ role: 'user', content }); persist('msgs');
  appendMsg('user', content);
  const ty = showTyping();
  setStatus('思考中…');

  try {
    const ac = activeChar();
    const payload = { model: S.api.model, messages: [{ role: 'system', content: ac.systemPrompt }, ...S.msgs.slice(-20).map(m => ({ role: m.role, content: m.content }))], max_tokens: S.api.maxTokens || 2048, temperature: S.api.temperature || 0.7 };
    const resp = await fetch(S.api.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.api.apiKey }, body: JSON.stringify(payload) });
    if (!resp.ok) { const t = await resp.text(); let m; try { m = JSON.parse(t).error?.message || 'HTTP ' + resp.status; } catch (e) { m = 'HTTP ' + resp.status; } throw new Error(m); }
    const data = await resp.json();
    const reply = data.choices?.[0]?.message?.content || '(空回复)';
    rm(ty);
    S.msgs.push({ role: 'assistant', content: reply }); persist('msgs');
    appendMsg('assistant', reply);
    setStatus('就绪');
  } catch (err) {
    rm(ty); setStatus('❌ ' + err.message);
  } finally {
    S.streaming = false; if (snd) snd.disabled = false; inp.focus();
  }
}

// ───────── 人物管理 ─────────
function renderChars() {
  const g = document.getElementById('aic-cgd'); if (!g || document.getElementById('aic-cmd')) return;
  g.innerHTML = S.chars.map(c => `
    <div class="aic-ccd${c.id === S.active ? ' ac' : ''}">
      <div class="aic-ccv">${c.avatar}</div><div class="aic-ccn">${c.name}</div><div class="aic-ccdsc">${esc(c.description)}</div>
      <div class="aic-ccac">
        <button class="aic-cbtn ac2" data-a="activate" data-id="${c.id}">${c.id===S.active?'✓当前':'启用'}</button>
        <button class="aic-cbtn" data-a="edit" data-id="${c.id}">编辑</button>
        <button class="aic-cbtn dl" data-a="delete" data-id="${c.id}">删除</button>
      </div>
    </div>`).join('');
  g.querySelectorAll('.aic-cbtn').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const a = b.dataset.a, id = b.dataset.id;
    if (a === 'activate') { S.active = id; persist('active'); renderChars(); updateTopBar(); }
    else if (a === 'edit') openCharModal(id);
    else if (a === 'delete') { if (S.chars.length <= 1) { alert('至少保留一个角色'); return; } if (!confirm('确定删除？')) return; S.chars = S.chars.filter(c => c.id !== id); persist('chars'); if (S.active === id) { S.active = S.chars[0].id; persist('active'); updateTopBar(); } renderChars(); }
  }));
  document.getElementById('aic-cab').onclick = () => openCharModal();
}

function openCharModal(id) {
  const ex = document.getElementById('aic-cmd'); if (ex) ex.remove();
  const ch = id ? S.chars.find(c => c.id === id) : null;
  const edit = !!ch;
  const md = el('div', { id: 'aic-cmd', c: 'aic-md' });
  md.addEventListener('click', e => { if (e.target === md) md.remove(); });
  const AV = '🤖|🧑‍⚕️|👨‍💻|🧑‍🏫|🎨|📚|🧠|💡|🔬|🎵|🏋️|🍳|✍️|💻|🌐|🤝|🎯|🔍|📊|🎮|🐱|🐶|🌟|⚡|🔥|💎'.split('|');
  const bx = el('div', { c: 'aic-mbx' });
  bx.innerHTML = `
    <div class="aic-mhd"><span>${edit?'编辑人物':'添加人物'}</span><button class="aic-mcl">✕</button></div>
    <div class="aic-mbd">
      <div class="aic-fg"><label>名称</label><input type="text" id="aic-cfn" value="${edit?esc(ch.name):''}" placeholder="角色名称" /></div>
      <div class="aic-fg"><label>头像</label><input type="text" id="aic-cfa" value="${edit?ch.avatar:'🤖'}" maxlength="4" /><div class="aic-eg">${AV.map(a=>'<span class="aic-eb">'+a+'</span>').join('')}</div></div>
      <div class="aic-fg"><label>描述</label><input type="text" id="aic-cfd" value="${edit?esc(ch.description):''}" placeholder="简短描述" /></div>
      <div class="aic-fg"><label>人设提示词</label><textarea id="aic-cfp" rows="5" placeholder="描述AI角色的性格...">${edit?esc(ch.systemPrompt):''}</textarea></div>
    </div>
    <div class="aic-mft"><button class="aic-bo aic-mcl-btn">取消</button><button class="aic-bp" id="aic-cfs">保存</button></div>`;
  md.appendChild(bx); document.body.appendChild(md);
  bx.querySelectorAll('.aic-eb').forEach(b => b.addEventListener('click', () => { document.getElementById('aic-cfa').value = b.textContent; }));
  bx.querySelector('.aic-mcl').onclick = () => md.remove();
  bx.querySelector('.aic-mcl-btn').onclick = () => md.remove();
  document.getElementById('aic-cfs').addEventListener('click', () => {
    const nm = document.getElementById('aic-cfn').value.trim(), av = document.getElementById('aic-cfa').value.trim() || '🤖', dc = document.getElementById('aic-cfd').value.trim(), pr = document.getElementById('aic-cfp').value.trim();
    if (!nm || !dc || !pr) { alert('请填写完整'); return; }
    if (edit) { const i = S.chars.findIndex(c => c.id === id); if (i !== -1) S.chars[i] = { ...S.chars[i], name: nm, avatar: av, role: 'assistant', description: dc, systemPrompt: pr }; }
    else S.chars.push({ id: 'c_' + Date.now(), name: nm, avatar: av, role: 'assistant', description: dc, systemPrompt: pr });
    persist('chars'); md.remove(); renderChars(); updateTopBar();
  });
}

function updateTopBar() {
  const ac = activeChar();
  const av = document.getElementById('aic-cav'), nm = document.getElementById('aic-cnm');
  if (av) av.textContent = ac.avatar;
  if (nm) nm.textContent = ac.name;
}

// ───────── 设置页面 ─────────
function renderSets() {
  const sv = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
  sv('aic-su', S.api.apiUrl); sv('aic-sk', S.api.apiKey); sv('aic-sm', S.api.model); sv('aic-smt', S.api.maxTokens);
  const tp = document.getElementById('aic-stp'); if (tp) { tp.value = S.api.temperature; document.getElementById('aic-stv').textContent = S.api.temperature; }

  const bnd = (id, ev, fn) => { const e = document.getElementById(id); if (e && !e._b) { e.addEventListener(ev, fn); e._b = true; } };
  bnd('aic-ss', 'click', saveSets);
  bnd('aic-st', 'click', testConn);
  bnd('aic-stk', 'click', () => { const i = document.getElementById('aic-sk'); if (i) { i.type = i.type==='password'?'text':'password'; document.getElementById('aic-stk').textContent = i.type==='password'?'👁️':'🙈'; } });
  const tp2 = document.getElementById('aic-stp'); if (tp2 && !tp2._b2) { tp2.addEventListener('input', () => { document.getElementById('aic-stv').textContent = tp2.value; }); tp2._b2 = true; }
  document.querySelectorAll('.aic-qb').forEach(b => {
    if (b._b) return; b._b = true;
    b.addEventListener('click', () => {
      const p = QUICK_CONFIGS[b.dataset.p]; if (!p) return;
      const ck = document.getElementById('aic-sk').value;
      sv('aic-su', p.apiUrl); sv('aic-sm', p.model); sv('aic-smt', p.maxTokens); sv('aic-stp', p.temperature);
      document.getElementById('aic-stv').textContent = p.temperature;
      if (ck) sv('aic-sk', ck);
      showSR('ok', '已应用配置（Key已保留）');
    });
  });
}

async function saveSets() {
  S.api = {
    apiUrl: document.getElementById('aic-su').value.trim(),
    apiKey: document.getElementById('aic-sk').value.trim(),
    model: document.getElementById('aic-sm').value.trim(),
    maxTokens: parseInt(document.getElementById('aic-smt').value) || 2048,
    temperature: parseFloat(document.getElementById('aic-stp').value) || 0.7
  };
  persist('api');
  showSR('ok', '✅ 已保存');
}

async function testConn() {
  const cfg = { apiUrl: document.getElementById('aic-su').value.trim(), apiKey: document.getElementById('aic-sk').value.trim(), model: document.getElementById('aic-sm').value.trim() };
  if (!cfg.apiUrl || !cfg.apiKey) { showSR('er', '请填写地址和Key'); return; }
  showSR('ld', '⏳ 测试中…');
  try {
    const r = await fetch(cfg.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey }, body: JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: 'Say OK' }], max_tokens: 5 }) });
    if (r.ok) { showSR('ok', '✅ 连接成功！'); await saveSets(); }
    else { const t = await r.text(); let m; try { m = JSON.parse(t).error?.message || 'HTTP ' + r.status; } catch (e) { m = 'HTTP ' + r.status; } showSR('er', '❌ ' + m); }
  } catch (e) { showSR('er', '❌ 网络错误: ' + e.message); }
}

function showSR(type, msg) {
  const e = document.getElementById('aic-sr'); if (!e) return;
  e.style.display = 'block'; e.className = 'aic-srt ' + type; e.textContent = msg;
  setTimeout(() => { e.style.display = 'none'; }, 4000);
}

// ───────── 打开/关闭 ─────────
function togglePanel() { S.open ? closePanel() : openPanel(); }
function openPanel() {
  if (!document.getElementById('aic-ov')) { createPanel(); updateTopBar(); renderMsgs(); }
  S.open = true;
  const o = document.getElementById('aic-ov'), p = document.getElementById('aic-pn');
  if (o) { o.style.display = 'flex'; setTimeout(() => o.classList.add('on'), 10); }
  if (p) p.classList.add('on');
  document.getElementById('aic-b').style.display = 'none';
  if (S.tab === 'characters') renderChars();
  if (S.tab === 'settings') renderSets();
}
function closePanel() {
  S.open = false;
  const o = document.getElementById('aic-ov'), p = document.getElementById('aic-pn');
  if (o) o.classList.remove('on'); if (p) p.classList.remove('on');
  setTimeout(() => { if (o) o.style.display = 'none'; }, 300);
  document.getElementById('aic-b').style.display = 'flex';
}

// ───────── 对外 API ─────────
export function init() {
  if (document.getElementById('aic-b')) return;
  injectCSS();
  createBall();
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && S.open) {
      const md = document.getElementById('aic-cmd'); if (md) { md.remove(); return; }
      closePanel();
    }
  });
}

export function destroy() {
  ['aic-b','aic-ov','aic-cmd','aic-css'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); });
  S.open = false;
}

export function getState() { return { open: S.open, tab: S.tab, characters: S.chars, activeCharId: S.active, messages: S.msgs, apiConfig: S.api }; }

export function addCharacter(c) { S.chars.push({ id: 'c_' + Date.now(), ...c, role: c.role || 'assistant' }); persist('chars'); }

export function setApiConfig(cfg) { S.api = { ...S.api, ...cfg }; persist('api'); }

// ───────── 自动启动 ─────────
if (typeof window !== 'undefined' && document.readyState !== 'loading') init();
else if (typeof window !== 'undefined') document.addEventListener('DOMContentLoaded', init);
