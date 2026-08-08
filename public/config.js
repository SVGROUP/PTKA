// 站点与配置管理页面逻辑（合并自原 sites.js + config.js）
// - 顶部：全局代理 + 随机登录
// - 中部：搜索栏 + 站点增删改/导入工具栏
// - 主体：每站点一张卡片，siteKey 作抬头，siteName/siteUrl/cookies/UA/proxyEnabled 全部 inline 编辑
// - 「保存配置」「删除」同卡同一行
// - 批量粘贴导入走模态框（复用 js/modal.js 的遮罩/ESC/按钮）
// 所有数据来源：/api/config/ + /api/config/settings + /api/config/import

let configs = [];
let originalConfigs = []; // 服务器初始值深拷贝，用于 diff 对比（不被用户编辑污染）
let currentGlobal = {
  globalProxyUrl: '',
  randomLoginEnabled: false,
  randomWindowStart: '08:00',
  randomWindowEnd: '23:00',
};

document.addEventListener('DOMContentLoaded', () => {
  const messageContainer = document.getElementById('message-container');
  const configListEl = document.getElementById('config-list');
  const globalProxyInput = document.getElementById('global-proxy-url');
  const randomEnabledInput = document.getElementById('random-login-enabled');
  const randomStartInput = document.getElementById('random-window-start');
  const randomEndInput = document.getElementById('random-window-end');
  const saveGlobalBtn = document.getElementById('save-global-settings');
  const searchInput = document.getElementById('config-search');
  const searchClearBtn = document.getElementById('config-search-clear');
  const emptyEl = document.getElementById('config-empty');
  const noSitesHintEl = document.getElementById('no-sites-hint');

  // ===================== 工具函数 =====================

  function showMessage(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `message-toast ${type}`;
    toast.textContent = message;
    if (!messageContainer) return;
    messageContainer.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => {
        if (toast.parentElement === messageContainer) {
          messageContainer.removeChild(toast);
        }
      }, 300);
    }, 4000);
  }

  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function parsePipeText(text) {
    const lines = String(text || '').split('\n');
    const out = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const parts = t.split('|');
      if (parts.length >= 3) {
        out.push({
          siteKey: parts[0].trim(),
          siteName: parts[1].trim(),
          siteUrl: parts[2].trim(),
        });
      }
    }
    return out;
  }

  // ===================== 数据获取 =====================

  async function fetchConfigs() {
    const loading = showLoading('正在同步配置…');
    try {
      const response = await fetch('/api/config/');
      const data = await response.json();
      if (data.success) {
        configs = data.data || [];
        // 深拷贝保存服务器原始值，供 computeAllChanges diff 用
        originalConfigs = configs.map(c => ({
          id: c.id, siteKey: c.siteKey, siteName: c.siteName, siteUrl: c.siteUrl,
          cookies: c.cookies, userAgent: c.userAgent,
          enabled: !!c.enabled, proxyEnabled: !!c.proxyEnabled,
        }));
        renderConfigList();
      } else {
        showMessage('获取站点失败: ' + (data.message || ''), 'error');
      }
    } catch (error) {
      console.error('获取站点失败:', error);
      showMessage('获取站点请求失败: ' + error.message, 'error');
    } finally {
      if (loading && loading.close) loading.close();
    }
  }

  async function fetchGlobalSettings() {
    try {
      const response = await fetch('/api/config/settings');
      const data = await response.json();
      if (data.success && data.data) {
        currentGlobal = {
          globalProxyUrl: data.data.globalProxyUrl || '',
          randomLoginEnabled: !!data.data.randomLoginEnabled,
          randomWindowStart: data.data.randomWindowStart || '08:00',
          randomWindowEnd: data.data.randomWindowEnd || '23:00',
        };
        if (globalProxyInput) globalProxyInput.value = currentGlobal.globalProxyUrl;
        if (randomEnabledInput) randomEnabledInput.checked = currentGlobal.randomLoginEnabled;
        if (randomStartInput) randomStartInput.value = currentGlobal.randomWindowStart;
        if (randomEndInput) randomEndInput.value = currentGlobal.randomWindowEnd;
      }
    } catch (error) {
      console.error('获取全局设置失败:', error);
    }
  }

  // ===================== 站点列表渲染 =====================

  function renderConfigList() {
    if (!configListEl) return;
    configListEl.innerHTML = '';
    configListEl.className = 'config-list';

    if (configs.length === 0) {
      if (noSitesHintEl) noSitesHintEl.style.display = 'block';
      if (emptyEl) emptyEl.style.display = 'none';
      return;
    } else {
      if (noSitesHintEl) noSitesHintEl.style.display = 'none';
    }

    configs.forEach(config => {
      const card = document.createElement('div');
      card.className = 'config-card';
      card.dataset.id = String(config.id);
      card.dataset.search = ((config.siteName || '') + ' ' + (config.siteKey || '')).toLowerCase();
      card.innerHTML = `
        <div class="config-site-row">
          <div class="config-site-key">${escapeHtml(config.siteKey)}</div>
          <label class="config-checkbox site-status-checkbox" title="启用 / 禁用站点">
            <input type="checkbox" ${config.enabled ? 'checked' : ''} data-id="${config.id}" data-field="enabled">
            <span>启用站点</span>
          </label>
        </div>
        <div class="config-row">
          <label class="config-label">名称</label>
          <input type="text" class="config-input" placeholder="例如: M-Team" value="${escapeHtml(config.siteName || '')}" data-id="${config.id}" data-field="siteName">
        </div>
        <div class="config-row">
          <label class="config-label">URL</label>
          <input type="url" class="config-input" placeholder="例如: https://kp.m-team.cc/" value="${escapeHtml(config.siteUrl || '')}" data-id="${config.id}" data-field="siteUrl">
        </div>
        <div class="config-row">
          <label class="config-label">Cookies</label>
          <input type="text" class="config-input" placeholder="输入cookies" value="${escapeHtml(config.cookies || '')}" data-id="${config.id}" data-field="cookies">
        </div>
        <div class="config-row">
          <label class="config-label">User-Agent</label>
          <input type="text" class="config-input" placeholder="留空用默认；" value="${escapeHtml(config.userAgent || '')}" data-id="${config.id}" data-field="userAgent">
        </div>
        <div class="config-row">
          <label class="config-checkbox">
            <input type="checkbox" ${config.proxyEnabled ? 'checked' : ''} data-id="${config.id}" data-field="proxyEnabled">
            <span>启用代理（使用上方全局代理地址）</span>
          </label>
        </div>
        <div class="config-row config-card-actions">
          <button class="btn-delete" data-id="${config.id}">删除</button>
        </div>
      `;

      const delBtn = card.querySelector('.btn-delete');
      delBtn.addEventListener('click', () => deleteSite(config.id));

      // 监听输入变化更新内存中的 config
      const inputs = card.querySelectorAll(`input[data-id="${config.id}"]`);
      inputs.forEach(input => {
        input.addEventListener(input.type === 'checkbox' ? 'change' : 'input', () => {
          const field = input.dataset.field;
          if (input.type === 'checkbox') {
            config[field] = input.checked;
          } else {
            config[field] = input.value;
          }
          markDirtyState();
        });
      });

      configListEl.appendChild(card);
    });

    applyFilter();
    // 重新渲染后重算 dirty 状态（服务器拉回的新值默认未变更）
    markDirtyState();
  }

  function applyFilter() {
    const kw = (searchInput ? searchInput.value : '').trim().toLowerCase();
    const cards = configListEl.querySelectorAll('.config-card');
    let visible = 0;
    cards.forEach(card => {
      const hay = card.dataset.search || '';
      const match = !kw || hay.includes(kw);
      card.style.display = match ? '' : 'none';
      if (match) visible++;
    });
    if (emptyEl) emptyEl.style.display = (cards.length && visible === 0) ? 'block' : 'none';
  }

  // ===================== 站点保存/删除/新增 =====================

  // ===================== 统一保存（仿 ARSS diff 弹窗） =====================

  // 字段元信息：id/label/敏感标记（敏感字段在 diff 中打码）
  // 顺序决定 diff 展示顺序
  const FIELD_DEFS = [
    { id: 'siteName',     label: '名称',        sensitive: false },
    { id: 'siteUrl',      label: 'URL',         sensitive: false },
    { id: 'cookies',      label: 'Cookies',     sensitive: true  },
    { id: 'userAgent',    label: 'User-Agent',  sensitive: false },
    { id: 'enabled',      label: '启用站点',    sensitive: false, isBool: true },
    { id: 'proxyEnabled', label: '启用代理',    sensitive: false, isBool: true },
  ];

  // 敏感字段打码：保留前 4 后 4，中间 ***
  // 长度 < 12 直接整体 ***
  function maskValue(v) {
    const s = String(v == null ? '' : v);
    if (s.length === 0) return '(空)';
    if (s.length < 12) return '***';
    return s.slice(0, 4) + '***' + s.slice(-4);
  }

  // 布尔值展示：true/false → 启用/禁用
  function formatValue(field, v) {
    if (field.isBool) return v ? '启用' : '禁用';
    if (v == null || v === '') return '(空)';
    if (field.sensitive) return maskValue(v);
    return String(v);
  }

  // 从卡片 DOM 收集当前 input 值（不依赖内存中的 config）
  function collectCurrentValues(cardId) {
    const card = configListEl.querySelector(`.config-card[data-id="${cardId}"]`);
    if (!card) return null;
    const out = {};
    FIELD_DEFS.forEach(f => {
      const inp = card.querySelector(`input[data-id="${cardId}"][data-field="${f.id}"]`);
      if (!inp) return;
      if (f.isBool) out[f.id] = !!inp.checked;
      else out[f.id] = inp.value;
    });
    return out;
  }

  // 聚合所有有变更的卡片
  // 返回 [{cardId, siteName, changes: [{label, oldVal, newVal}]}, ...]
  // 跟 originalConfigs（服务器初始值）对比，不跟内存中的 configs 对比
  // （内存中的 configs 会被输入监听同步更新，永远跟 DOM 一致）
  function computeAllChanges() {
    const groups = [];
    originalConfigs.forEach(orig => {
      const current = collectCurrentValues(orig.id);
      if (!current) return;
      const cfg = configs.find(c => c.id === orig.id);
      const siteName = (cfg && cfg.siteName) || orig.siteName || orig.siteKey || `#${orig.id}`;
      const siteKey = (cfg && cfg.siteKey) || orig.siteKey;
      const changes = [];
      FIELD_DEFS.forEach(f => {
        const oldV = orig[f.id];
        const newV = current[f.id];
        // 布尔走严格 false/true 比较；字符串走 trim 后比较（避免全空格差异）
        const eq = f.isBool
          ? Boolean(oldV) === Boolean(newV)
          : String(oldV == null ? '' : oldV).trim() === String(newV == null ? '' : newV).trim();
        if (!eq) {
          changes.push({
            label: f.label,
            oldVal: formatValue(f, oldV),
            newVal: formatValue(f, newV),
          });
        }
      });
      if (changes.length > 0) {
        groups.push({
          cardId: orig.id,
          siteName,
          siteKey,
          changes,
        });
      }
    });
    return groups;
  }

  // 格式化变更清单为确认弹窗的 message 文本
  function formatChanges(groups) {
    if (groups.length === 0) return '没有配置项发生变更。';
    const lines = [`以下 ${groups.length} 个站点的配置将被修改：\n`];
    groups.forEach((g, idx) => {
      lines.push(`▍${idx + 1}. ${g.siteName}（${g.siteKey || '-'}）`);
      g.changes.forEach(c => {
        lines.push(`    • ${c.label}: ${c.oldVal}  →  ${c.newVal}`);
      });
      lines.push('');
    });
    lines.push('确认保存这些更改吗？');
    return lines.join('\n');
  }

  // 顶部统一保存按钮的视觉提示：有未保存变更时高亮（按钮始终可点，0 变更时点会弹 info）
  function markDirtyState() {
    const btn = document.getElementById('btnSaveAll');
    if (!btn) return;
    const dirty = computeAllChanges().length > 0;
    btn.classList.toggle('has-changes', dirty);
  }

  // 统一保存入口
  async function saveAllConfigs() {
    const groups = computeAllChanges();
    if (groups.length === 0) {
      showMessage('当前没有需要保存的变更', 'info');
      return;
    }
    const ok = await window.confirmModal({
      title: '确认保存变更',
      message: formatChanges(groups),
      confirmText: '保存',
      cancelText: '取消',
      danger: true,
    });
    if (!ok) return;

    const btn = document.getElementById('btnSaveAll');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '保存中...';
    }
    let okCount = 0;
    let failCount = 0;
    const failedSites = [];
    for (const g of groups) {
      const payload = collectCurrentValues(g.cardId);
      try {
        const res = await fetch(`/api/config/${g.cardId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.success) okCount++;
        else { failCount++; failedSites.push(`${g.siteName}: ${data.message || '未知错误'}`); }
      } catch (err) {
        failCount++;
        failedSites.push(`${g.siteName}: ${err.message}`);
      }
    }
    // 重新拉取最新状态，刷新卡片 + 内存 + originalConfigs（服务器值变为新基准）
    await fetchConfigs();
    if (btn) btn.textContent = '💾 保存所有变更';
    if (failCount === 0) {
      showMessage(`保存成功！共修改 ${okCount} 个站点`, 'success');
    } else {
      showMessage(`部分失败：成功 ${okCount}，失败 ${failCount}。${failedSites.join('；')}`, 'error');
    }
    // fetchConfigs 已重置 originalConfigs + 重渲卡片，无需 markDirtyState
  }

  async function deleteSite(id) {
    const site = configs.find(s => s.id === id);
    if (!site) return;
    const ok = await window.confirmModal({
      title: '删除站点',
      message: `确定要删除站点 "${site.siteName}" 吗？\n此操作不可恢复。`,
      confirmText: '删除',
      cancelText: '取消',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/config/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showMessage(data.message || '删除成功', 'success');
        await fetchConfigs();
      } else {
        showMessage(data.message || '删除失败', 'error');
      }
    } catch (err) {
      showMessage('删除失败: ' + err.message, 'error');
    }
  }

  // 轻量 loading toast：返回 { close } 让调用者控制关闭
  function showLoading(text) {
    const container = document.getElementById('message-container');
    if (!container) return { close: () => {} };
    const toast = document.createElement('div');
    toast.className = 'message-toast loading';
    toast.textContent = text || '加载中…';
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    return {
      close() {
        toast.classList.remove('show');
        setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 200);
      }
    };
  }

  // 新增站点：弹模态框，输入 siteKey + siteName + siteUrl
  async function addSiteModal() {
    // 复用 confirmModal 的遮罩/按钮/ESC，自渲染带 3 个 input 的 body
    const result = await _inputModal({
      title: '新增站点',
      fields: [
        { name: 'siteKey', label: '站点标识', placeholder: '例如: mteam', required: true,
          hint: '唯一标识，仅支持字母数字，创建后不可修改' },
        { name: 'siteName', label: '站点名称', placeholder: '例如: M-Team', required: true },
        { name: 'siteUrl', label: '站点 URL', placeholder: '例如: https://kp.m-team.cc/', required: true, type: 'url' },
      ],
      confirmText: '保存',
      cancelText: '取消',
    });
    if (!result) return;
    const { siteKey, siteName, siteUrl } = result;
    try {
      const res = await fetch('/api/config/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteKey, siteName, siteUrl }),
      });
      const data = await res.json();
      if (data.success) {
        showMessage(data.message || '新增成功', 'success');
        // 重新拉取全量配置数据，确保新站点出现在列表中
        // _inputModal 淡出动画 200ms，先等动画跑完再拉取避免 DOM 抢竞
        await new Promise(r => setTimeout(r, 220));
        await fetchConfigs();
      } else {
        showMessage(data.message || '新增失败', 'error');
      }
    } catch (err) {
      showMessage('新增失败: ' + err.message, 'error');
    }
  }

  // 通用输入模态框：仿 promptModal 但支持多个字段
  // 返回 Promise<{ [name]: value } | null>，null 表示取消
  function _inputModal({ title, fields, confirmText, cancelText }) {
    return new Promise((resolve) => {
      let root = document.getElementById('__ptka_modal_root__');
      if (!root) {
        root = document.createElement('div');
        root.id = '__ptka_modal_root__';
        document.body.appendChild(root);
      }
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'alertdialog');
      overlay.setAttribute('aria-modal', 'true');
      if (title) overlay.setAttribute('aria-label', title);

      const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

      const fieldsHtml = fields.map(f => `
        <div class="modal-field">
          <label class="modal-field-label">${esc(f.label)}${f.required ? ' <span class="modal-field-req">*</span>' : ''}</label>
          <input type="${esc(f.type || 'text')}" class="modal-input" name="${esc(f.name)}" placeholder="${esc(f.placeholder || '')}" ${f.required ? 'required' : ''}>
          ${f.hint ? `<div class="modal-field-hint">${esc(f.hint)}</div>` : ''}
        </div>
      `).join('');

      overlay.innerHTML = `
        <div class="modal-card" role="document">
          <div class="modal-header">
            <div class="modal-icon" aria-hidden="true">+</div>
            <div class="modal-title">${esc(title || '输入')}</div>
          </div>
          <div class="modal-body">${fieldsHtml}</div>
          <div class="modal-footer">
            <button class="modal-btn modal-btn-cancel" data-act="cancel" type="button">${esc(cancelText || '取消')}</button>
            <button class="modal-btn modal-btn-confirm" data-act="confirm" type="button">${esc(confirmText || '确定')}</button>
          </div>
        </div>
      `;

      root.appendChild(overlay);
      const prevFocus = document.activeElement;

      function close(value) {
        overlay.classList.remove('modal-show');
        setTimeout(() => {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          if (prevFocus && typeof prevFocus.focus === 'function') {
            try { prevFocus.focus(); } catch (_) {}
          }
        }, 200);
        resolve(value);
      }

      overlay.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-act]');
        if (btn) {
          if (btn.dataset.act === 'confirm') {
            const inputs = overlay.querySelectorAll('input.modal-input');
            const out = {};
            for (const inp of inputs) {
              out[inp.name] = inp.value.trim();
            }
            // 必填校验
            for (const f of fields) {
              if (f.required && !out[f.name]) {
                showMessage(`${f.label}不能为空`, 'error');
                const inp = overlay.querySelector(`input[name="${f.name}"]`);
                if (inp) { try { inp.focus(); } catch (_) {} }
                return;
              }
            }
            close(out);
          } else {
            close(null);
          }
          return;
        }
        if (e.target === overlay) close(null); // 点遮罩取消
      });

      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          close(null);
        } else if (e.key === 'Enter') {
          // 在 input 中按 Enter = 确认
          const tag = (document.activeElement && document.activeElement.tagName) || '';
          if (tag === 'INPUT') {
            e.preventDefault();
            overlay.querySelector('button[data-act="confirm"]').click();
          }
        }
      });

      // 显示动画 + 焦点落到第一个 input
      requestAnimationFrame(() => overlay.classList.add('modal-show'));
      setTimeout(() => {
        const first = overlay.querySelector('input.modal-input');
        if (first) { try { first.focus(); } catch (_) {} }
      }, 30);
    });
  }

  // 批量粘贴导入模态框
  async function batchImportModal() {
    const result = await _inputModal({
      title: '批量导入站点',
      fields: [
        { name: 'sitesText', label: '站点列表', placeholder: '每行一个: site_key|site_name|site_url', required: true,
          hint: '每行格式: site_key|site_name|site_url（# 开头视为注释）' },
      ],
      confirmText: '开始导入',
      cancelText: '取消',
    });
    if (!result) return;
    const sites = parsePipeText(result.sitesText);
    if (sites.length === 0) {
      showMessage('没有解析到有效的站点数据', 'error');
      return;
    }
    const ok = await window.confirmModal({
      title: '导入站点',
      message: `确定要导入 ${sites.length} 个站点吗？已存在的站点会被跳过。`,
      confirmText: '导入',
      cancelText: '取消',
    });
    if (!ok) return;
    try {
      const res = await fetch('/api/config/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sites }),
      });
      const data = await res.json();
      if (data.success) {
        showMessage(data.message || '批量导入完成', 'success');
        await fetchConfigs();
      } else {
        showMessage(data.message || '导入失败', 'error');
      }
    } catch (err) {
      showMessage('导入失败: ' + err.message, 'error');
    }
  }

  // 导入默认站点
  async function importDefaultSites() {
    const ok = await window.confirmModal({
      title: '导入默认站点',
      message: '确定要导入默认站点列表吗？会添加所有预设的PT站点，已存在的会被跳过。',
      confirmText: '导入',
      cancelText: '取消',
    });
    if (!ok) return;
    try {
      const res = await fetch('default_sites.txt');
      if (!res.ok) {
        showMessage('获取默认站点文件失败: HTTP ' + res.status, 'error');
        return;
      }
      const text = await res.text();
      const sites = parsePipeText(text);
      if (sites.length === 0) {
        showMessage('默认站点列表为空', 'error');
        return;
      }
      const importRes = await fetch('/api/config/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sites }),
      });
      const data = await importRes.json();
      if (data.success) {
        showMessage(data.message || '默认站点导入完成', 'success');
        await fetchConfigs();
      } else {
        showMessage(data.message || '导入失败', 'error');
      }
    } catch (err) {
      showMessage('导入失败: ' + err.message, 'error');
    }
  }

  // ===================== 全局设置 =====================

  async function saveGlobalSettings() {
    if (!saveGlobalBtn) return;
    saveGlobalBtn.disabled = true;
    saveGlobalBtn.textContent = '保存中...';
    try {
      const response = await fetch('/api/config/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          globalProxyUrl: globalProxyInput ? globalProxyInput.value.trim() : '',
          randomLoginEnabled: randomEnabledInput ? randomEnabledInput.checked : false,
          randomWindowStart: randomStartInput ? randomStartInput.value : '08:00',
          randomWindowEnd: randomEndInput ? randomEndInput.value : '23:00',
        }),
      });
      const data = await response.json();
      if (data.success) {
        showMessage('全局设置保存成功！', 'success');
        if (data.data) {
          if (globalProxyInput) globalProxyInput.value = data.data.globalProxyUrl || '';
          if (randomEnabledInput) randomEnabledInput.checked = !!data.data.randomLoginEnabled;
          if (randomStartInput) randomStartInput.value = data.data.randomWindowStart || '08:00';
          if (randomEndInput) randomEndInput.value = data.data.randomWindowEnd || '23:00';
        }
      } else {
        showMessage(`保存失败: ${data.message}`, 'error');
      }
    } catch (error) {
      showMessage(`保存请求失败: ${error.message}`, 'error');
    } finally {
      saveGlobalBtn.disabled = false;
      saveGlobalBtn.textContent = '保存全局设置';
    }
  }

  // ===================== 事件绑定 =====================

  const btnAddSite = document.getElementById('btnAddSite');
  if (btnAddSite) btnAddSite.addEventListener('click', addSiteModal);

  const btnBatchImport = document.getElementById('btnBatchImport');
  if (btnBatchImport) btnBatchImport.addEventListener('click', batchImportModal);

  const btnImportDefault = document.getElementById('btnImportDefault');
  if (btnImportDefault) btnImportDefault.addEventListener('click', importDefaultSites);

  if (saveGlobalBtn) saveGlobalBtn.addEventListener('click', saveGlobalSettings);

  const btnSaveAll = document.getElementById('btnSaveAll');
  if (btnSaveAll) btnSaveAll.addEventListener('click', saveAllConfigs);

  if (searchInput) searchInput.addEventListener('input', applyFilter);
  if (searchClearBtn) {
    searchClearBtn.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        applyFilter();
        searchInput.focus();
      }
    });
  }

  // 初始加载
  (async () => {
    await fetchGlobalSettings();
    await fetchConfigs();
  })();
});
