// 站点与配置管理页面逻辑（合并自原 sites.js + config.js）
// - 顶部：全局代理 + 随机登录
// - 中部：搜索栏 + 站点增删改/导入工具栏
// - 主体：每站点一张卡片，含 cookies/UA/代理启用/启停 + 站点名/URL/Key（Key 不可改）
// 所有数据来源：/api/config/ + /api/config/settings + /api/config/import

let configs = [];
let isEditing = false;
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

  // 统一消息提示
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

  // HTML 转义
  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // 解析 | 文本为站点数组（用于批量导入 / 默认站点文件）
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
    try {
      const response = await fetch('/api/config/');
      const data = await response.json();
      if (data.success) {
        configs = data.data || [];
        renderConfigList();
      } else {
        showMessage('获取站点失败: ' + (data.message || ''), 'error');
      }
    } catch (error) {
      console.error('获取站点失败:', error);
      showMessage('获取站点请求失败: ' + error.message, 'error');
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
          <div class="config-site-name">${escapeHtml(config.siteName || config.siteKey)}</div>
          <div class="config-site-meta">
            <span class="site-key">${escapeHtml(config.siteKey)}</span>
            <span class="site-status ${config.enabled ? 'enabled' : 'disabled'}">
              ${config.enabled ? '启用' : '禁用'}
            </span>
          </div>
          <div class="config-site-actions">
            <button class="btn btn-sm btn-secondary" data-action="edit" data-id="${config.id}">编辑名/URL</button>
            <button class="btn btn-sm btn-danger" data-action="delete" data-id="${config.id}">删除</button>
          </div>
        </div>
        <div class="config-site-url">${escapeHtml(config.siteUrl || '')}</div>
        <hr class="config-divider">
        <div class="config-row">
          <label class="config-checkbox">
            <input type="checkbox" ${config.enabled ? 'checked' : ''} data-id="${config.id}" data-field="enabled">
            <span>启用站点</span>
          </label>
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
        <div class="config-row">
          <button class="btn-save" data-id="${config.id}">保存配置</button>
        </div>
      `;

      const saveBtn = card.querySelector('.btn-save');
      saveBtn.addEventListener('click', () => saveConfig(config.id));

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
        });
      });

      // 编辑/删除按钮
      const editBtn = card.querySelector('button[data-action="edit"]');
      const delBtn = card.querySelector('button[data-action="delete"]');
      if (editBtn) editBtn.addEventListener('click', () => editSite(config.id));
      if (delBtn) delBtn.addEventListener('click', () => deleteSite(config.id));

      configListEl.appendChild(card);
    });

    applyFilter();
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

  // ===================== 站点保存/编辑/删除/新增 =====================

  async function saveConfig(id) {
    const config = configs.find(c => c.id === id);
    if (!config) return;
    const saveBtn = configListEl.querySelector(`.btn-save[data-id="${id}"]`);
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '保存中...';
    }
    try {
      const response = await fetch(`/api/config/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: config.enabled,
          cookies: config.cookies,
          proxyEnabled: config.proxyEnabled,
          userAgent: config.userAgent,
        }),
      });
      const data = await response.json();
      if (data.success) {
        showMessage('配置保存成功！', 'success');
        await fetchConfigs();
      } else {
        showMessage(`保存失败: ${data.message}`, 'error');
      }
    } catch (error) {
      showMessage(`保存请求失败: ${error.message}`, 'error');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存配置';
      }
    }
  }

  // 打开「编辑站点」表单（编辑名/URL，Key 不可改）
  function editSite(id) {
    const site = configs.find(s => s.id === id);
    if (!site) return;
    isEditing = true;
    document.getElementById('formTitle').textContent = `编辑站点: ${site.siteName}`;
    document.getElementById('siteId').value = site.id;
    document.getElementById('siteKey').value = site.siteKey;
    document.getElementById('siteKey').disabled = true;
    document.getElementById('siteName').value = site.siteName;
    document.getElementById('siteUrl').value = site.siteUrl;
    document.getElementById('formCard').style.display = 'block';
    document.getElementById('siteName').focus();
    document.getElementById('formCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  // ===================== 批量导入 / 默认站点 =====================

  async function postImport(sites, successHint) {
    if (!sites || sites.length === 0) {
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
        showMessage(data.message || successHint, 'success');
        const ta = document.getElementById('batchImportText');
        if (ta) ta.value = '';
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

  // 新增站点
  const btnAddSite = document.getElementById('btnAddSite');
  if (btnAddSite) {
    btnAddSite.addEventListener('click', () => {
      isEditing = false;
      document.getElementById('formTitle').textContent = '新增站点';
      document.getElementById('siteForm').reset();
      document.getElementById('siteId').value = '';
      document.getElementById('siteKey').disabled = false;
      document.getElementById('formCard').style.display = 'block';
      document.getElementById('siteKey').focus();
    });
  }

  // 取消新增/编辑
  const btnCancel = document.getElementById('btnCancel');
  if (btnCancel) {
    btnCancel.addEventListener('click', () => {
      document.getElementById('formCard').style.display = 'none';
    });
  }

  // 新增/编辑表单提交
  const siteForm = document.getElementById('siteForm');
  if (siteForm) {
    siteForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const siteId = document.getElementById('siteId').value;
      const siteKey = document.getElementById('siteKey').value.trim();
      const siteName = document.getElementById('siteName').value.trim();
      const siteUrl = document.getElementById('siteUrl').value.trim();
      try {
        let res;
        if (isEditing && siteId) {
          res = await fetch(`/api/config/${siteId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ siteName, siteUrl }),
          });
        } else {
          res = await fetch('/api/config/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ siteKey, siteName, siteUrl }),
          });
        }
        const data = await res.json();
        if (data.success) {
          showMessage(data.message || '保存成功', 'success');
          document.getElementById('formCard').style.display = 'none';
          await fetchConfigs();
        } else {
          showMessage(data.message || '操作失败', 'error');
        }
      } catch (err) {
        showMessage('操作失败: ' + err.message, 'error');
      }
    });
  }

  // 批量粘贴导入（展开/收起）
  const btnBatchImportToggle = document.getElementById('btnBatchImportToggle');
  const batchImportCard = document.getElementById('batchImportCard');
  if (btnBatchImportToggle && batchImportCard) {
    btnBatchImportToggle.addEventListener('click', () => {
      const isOpen = batchImportCard.style.display !== 'none';
      batchImportCard.style.display = isOpen ? 'none' : 'block';
      btnBatchImportToggle.textContent = isOpen ? '批量粘贴导入' : '收起批量导入';
      if (!isOpen) {
        const ta = document.getElementById('batchImportText');
        if (ta) ta.focus();
      }
    });
  }
  const btnBatchImportClose = document.getElementById('btnBatchImportClose');
  if (btnBatchImportClose && batchImportCard && btnBatchImportToggle) {
    btnBatchImportClose.addEventListener('click', () => {
      batchImportCard.style.display = 'none';
      btnBatchImportToggle.textContent = '批量粘贴导入';
    });
  }
  const btnBatchImport = document.getElementById('btnBatchImport');
  if (btnBatchImport) {
    btnBatchImport.addEventListener('click', async () => {
      const text = document.getElementById('batchImportText').value;
      const sites = parsePipeText(text);
      await postImport(sites, '批量导入完成');
    });
  }

  // 导入默认站点
  const btnImportDefault = document.getElementById('btnImportDefault');
  if (btnImportDefault) {
    btnImportDefault.addEventListener('click', async () => {
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
    });
  }

  if (saveGlobalBtn) saveGlobalBtn.addEventListener('click', saveGlobalSettings);

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
