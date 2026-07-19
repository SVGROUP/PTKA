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

  // 存储数据
  let configs = [];

  // 显示消息提示
  function showMessage(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `message-toast ${type}`;
    toast.textContent = message;
    messageContainer.appendChild(toast);

    // 触发动画
    setTimeout(() => toast.classList.add('show'), 10);

    // 自动移除
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => {
        if (toast.parentElement === messageContainer) {
          messageContainer.removeChild(toast);
        }
      }, 300);
    }, 4000);
  }

  // HTML转义
  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // 获取配置列表
  async function fetchConfigs() {
    try {
      const response = await fetch('/api/config/');
      const data = await response.json();

      if (data.success) {
        configs = data.data;
        renderConfigList();
      }
    } catch (error) {
      console.error('获取配置失败:', error);
    }
  }

  // 渲染配置列表
  function renderConfigList() {
    configListEl.innerHTML = '';
    configListEl.className = 'config-list';

    configs.forEach(config => {
      const configCard = document.createElement('div');
      configCard.className = 'config-card';
      configCard.innerHTML = `
        <div class="config-site-name">${escapeHtml(config.siteName || config.siteKey)}</div>
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

      const saveBtn = configCard.querySelector('.btn-save');
      saveBtn.addEventListener('click', () => saveConfig(config.id));

      // 监听输入变化更新数据
      const inputs = configCard.querySelectorAll(`input[data-id="${config.id}"]`);
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

      configListEl.appendChild(configCard);
    });

    applyFilter();
  }

  // 根据搜索关键词过滤站点卡片
  function applyFilter() {
    const kw = (searchInput ? searchInput.value : '').trim().toLowerCase();
    const cards = configListEl.querySelectorAll('.config-card');
    let visible = 0;
    cards.forEach((card, idx) => {
      const cfg = configs[idx];
      const hay = ((cfg && (cfg.siteName || '')) + ' ' + (cfg && (cfg.siteKey || ''))).toLowerCase();
      const match = !kw || hay.includes(kw);
      card.style.display = match ? '' : 'none';
      if (match) visible++;
    });
    if (emptyEl) emptyEl.style.display = (cards.length && visible === 0) ? 'block' : 'none';
  }

  // 保存配置
  async function saveConfig(id) {
    const config = configs.find(c => c.id === id);
    if (!config) return;

    const saveBtn = document.querySelector(`.btn-save[data-id="${id}"]`);
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';

    try {
      const response = await fetch(`/api/config/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          enabled: config.enabled,
          cookies: config.cookies,
          proxyEnabled: config.proxyEnabled,
          userAgent: config.userAgent
        })
      });

      const data = await response.json();

      if (data.success) {
        showMessage('配置保存成功！', 'success');
        // 重新加载配置
        await fetchConfigs();
      } else {
        showMessage(`保存失败: ${data.message}`, 'error');
      }
    } catch (error) {
      showMessage(`保存请求失败: ${error.message}`, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '保存配置';
    }
  }

  // 获取全局设置（全局代理地址）
  async function fetchGlobalSettings() {
    try {
      const response = await fetch('/api/config/settings');
      const data = await response.json();
      if (data.success && globalProxyInput) {
        globalProxyInput.value = data.data.globalProxyUrl || '';
        if (randomEnabledInput) randomEnabledInput.checked = !!data.data.randomLoginEnabled;
        if (randomStartInput) randomStartInput.value = data.data.randomWindowStart || '08:00';
        if (randomEndInput) randomEndInput.value = data.data.randomWindowEnd || '23:00';
      }
    } catch (error) {
      console.error('获取全局设置失败:', error);
    }
  }

  // 保存全局设置
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
          randomWindowEnd: randomEndInput ? randomEndInput.value : '23:00'
        })
      });
      const data = await response.json();
      if (data.success) {
        showMessage('全局设置保存成功！', 'success');
        if (globalProxyInput) globalProxyInput.value = data.data.globalProxyUrl || '';
        if (randomEnabledInput) randomEnabledInput.checked = !!data.data.randomLoginEnabled;
        if (randomStartInput) randomStartInput.value = data.data.randomWindowStart || '08:00';
        if (randomEndInput) randomEndInput.value = data.data.randomWindowEnd || '23:00';
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

  if (saveGlobalBtn) {
    saveGlobalBtn.addEventListener('click', saveGlobalSettings);
  }

  // 搜索事件
  if (searchInput) {
    searchInput.addEventListener('input', applyFilter);
  }
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
