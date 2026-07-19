document.addEventListener('DOMContentLoaded', () => {
  // 标签页切换
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const messageContainer = document.getElementById('message-container');

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

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;

      // 切换按钮状态
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // 切换内容
      tabContents.forEach(c => c.classList.remove('active'));
      document.getElementById(`tab-${tab}`).classList.add('active');
    });
  });

  const sitesContainer = document.getElementById('sites-container');
  const loginAllBtn = document.getElementById('login-all');
  const refreshBtn = document.getElementById('refresh-status');
  const configListEl = document.getElementById('config-list');

  // 存储数据
  let sitesData = [];
  let configs = [];
  let statusCache = {}; // 缓存登录状态

  // 格式化时间
  function formatTime(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
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

  // 创建站点卡片
  function createSiteCard(site) {
    const card = document.createElement('div');
    card.className = 'site-card';
    card.id = `site-${site.siteKey}`;

    // 由于状态已经加载完成，直接显示最终状态，不需要占位
    const record = statusCache[site.siteKey];
    let statusText = '暂无记录';
    let statusClass = 'unknown';
    let lastLogin = '-';
    let message = '暂无记录';

    if (record) {
      if (record.success) {
        statusText = '成功';
        statusClass = 'success';
      } else {
        statusText = '失败';
        statusClass = 'failed';
      }
      lastLogin = formatTime(record.timestamp);
      message = record.message || '无信息';
    }

    card.innerHTML = `
      <div class="site-header">
        <h2>${escapeHtml(site.siteName || site.siteKey)}</h2>
        <span class="status-badge ${statusClass}" id="status-${site.siteKey}">${statusText}</span>
      </div>
      <div class="site-info">
        <p class="last-login">上次登录：<span id="last-login-${site.siteKey}">${lastLogin}</span></p>
        <p class="last-message">状态信息：<span id="message-${site.siteKey}">${message}</span></p>
      </div>
      <button class="btn-login" data-site="${site.siteKey}">手动登录</button>
    `;

    // 绑定事件
    const btn = card.querySelector('.btn-login');
    btn.addEventListener('click', () => triggerLogin(site.siteKey));

    return card;
  }

  // 设置状态badge
  function setStatus(siteKey, record) {
    const el = document.getElementById(`status-${siteKey}`);
    if (!el) return;

    const lastLoginEl = document.getElementById(`last-login-${siteKey}`);
    const messageEl = document.getElementById(`message-${siteKey}`);

    // 缓存状态用于排序
    statusCache[siteKey] = record;

    if (!record) {
      el.textContent = '暂无记录';
      el.className = 'status-badge unknown';
      if (lastLoginEl) lastLoginEl.textContent = '-';
      if (messageEl) messageEl.textContent = '暂无记录';
      return;
    }

    if (record.success) {
      el.textContent = '成功';
      el.className = 'status-badge success';
    } else {
      el.textContent = '失败';
      el.className = 'status-badge failed';
    }

    if (lastLoginEl) lastLoginEl.textContent = formatTime(record.timestamp);
    if (messageEl) messageEl.textContent = record.message || '无信息';
  }

  // 设置按钮加载状态
  function setButtonLoading(siteKey, loading) {
    const btn = document.querySelector(`.site-card button[data-site="${siteKey}"]`);
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? '登录中...' : '手动登录';
  }

  // 设置所有按钮加载状态
  function setAllButtonsLoading(loading) {
    sitesData.forEach(site => {
      const btn = document.querySelector(`.site-card button[data-site="${site.siteKey}"]`);
      if (btn) {
        btn.disabled = loading;
        if (!loading) {
          btn.textContent = '手动登录';
        }
      }
    });
    loginAllBtn.disabled = loading;
    refreshBtn.disabled = loading;
    loginAllBtn.textContent = loading ? '登录中...' : '全部重新登录';
  }

  // 获取状态，获取完成后直接排序渲染
  async function fetchStatus() {
    try {
      const response = await fetch('/api/status');
      const data = await response.json();

      if (data.success) {
        data.data.forEach(item => {
          const siteKey = item.config.siteKey;
          statusCache[siteKey] = item.lastLog;
        });
      }
      // 状态填充完毕，直接排序渲染
      renderSites(sitesData);
    } catch (error) {
      console.error('获取状态失败:', error);
      // 即使获取状态失败也要渲染
      renderSites(sitesData);
    }
  }

  // 根据登录状态获取排序权重（失败 > 未配置 > 成功）
  function getSiteSortWeight(siteKey) {
    const record = statusCache[siteKey];
    if (!record) {
      // 未配置记录，权重居中
      return 1;
    }
    if (!record.success) {
      // 登录失败，权重最高，排在最前
      return 0;
    }
    // 登录成功，权重最低，排在最后
    return 2;
  }

  // 渲染所有站点卡片
  function renderSites(sites) {
    sitesContainer.innerHTML = '';
    sitesData = sites;
    
    // 过滤启用的站点，并根据登录状态排序
    const enabledSites = sites.filter(site => site.enabled);
    
    // 排序：登录失败(0) → 未配置(1) → 登录成功(2)
    enabledSites.sort((a, b) => {
      const weightA = getSiteSortWeight(a.siteKey);
      const weightB = getSiteSortWeight(b.siteKey);
      
      return weightA - weightB;
    });
    
    enabledSites.forEach(site => {
      const card = createSiteCard(site);
      sitesContainer.appendChild(card);
    });
  }

  // 单个站点登录
  async function triggerLogin(siteKey) {
    setButtonLoading(siteKey, true);
    try {
      const response = await fetch(`/api/login/${siteKey}`, { method: 'POST' });
      const data = await response.json();

      if (data.success) {
        statusCache[siteKey] = data.data;
      } else {
        const site = sitesData.find(s => s.siteKey === siteKey);
        const siteName = site ? site.siteName : siteKey;
        showMessage(`${siteName} 登录失败: ${data.message}`, 'error');
      }

      // 重新获取状态后在 fetchStatus 内部自动排序渲染
      await fetchStatus();
    } catch (error) {
      const site = sitesData.find(s => s.siteKey === siteKey);
      const siteName = site ? site.siteName : siteKey;
      showMessage(`${siteName} 登录请求失败: ${error.message}`, 'error');
    } finally {
      setButtonLoading(siteKey, false);
    }
  }

  // 全部登录
  async function triggerAllLogin() {
    setAllButtonsLoading(true);
    try {
      const response = await fetch('/api/login/all', { method: 'POST' });
      const data = await response.json();

      if (data.success) {
        const results = data.data;
        let successCount = 0;
        let failCount = 0;

        for (const [siteKey, result] of Object.entries(results)) {
          statusCache[siteKey] = result;
          if (result.success) successCount++;
          else failCount++;
        }

        const type = failCount === 0 ? 'success' : (successCount > 0 ? 'info' : 'error');
        showMessage(`全部登录完成: 成功 ${successCount} 个, 失败 ${failCount} 个`, type);
      } else {
        showMessage(`全部登录失败: ${data.message}`, 'error');
      }

      // 重新获取状态后在 fetchStatus 内部自动排序渲染
      await fetchStatus();
    } catch (error) {
      showMessage(`全部登录请求失败: ${error.message}`, 'error');
    } finally {
      setAllButtonsLoading(false);
    }
  }

  // 获取配置列表
  async function fetchConfigs() {
    try {
      const response = await fetch('/api/config');
      const data = await response.json();

      if (data.success) {
        configs = data.data;
        renderConfigList();
        sitesData = data.data.filter(c => c.enabled);
      }
    } catch (error) {
      console.error('获取配置失败:', error);
      sitesData = [];
    }
  }

  // 初始化加载：先获取配置，再获取状态（在 fetchStatus 内完成渲染）
  async function initLoad() {
    // 1. 先请求配置，赋值给 sitesData
    await fetchConfigs();
    // 2. 清空状态缓存
    statusCache = {};
    // 3. 请求状态，填充缓存后在 fetchStatus 内直接排序渲染
    await fetchStatus();
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
          <label class="config-checkbox">
            <input type="checkbox" ${config.proxyEnabled ? 'checked' : ''} data-id="${config.id}" data-field="proxyEnabled">
            <span>启用代理</span>
          </label>
        </div>
        <div class="config-row">
          <label class="config-label">代理地址</label>
          <input type="text" class="config-input" placeholder="例如: http://127.0.0.1:7890" value="${escapeHtml(config.proxyUrl || '')}" data-id="${config.id}" data-field="proxyUrl">
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
          proxyUrl: config.proxyUrl
        })
      });

      const data = await response.json();

      if (data.success) {
        showMessage('配置保存成功！', 'success');
        // 重新加载并渲染：先获取配置，再获取状态，最后排序渲染
        await initLoad();
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

  // 绑定事件
  loginAllBtn.addEventListener('click', () => triggerAllLogin());
  refreshBtn.addEventListener('click', async () => {
    await initLoad();
  });

  // 初始加载：先获取配置，再获取状态，最后一次性排序渲染
  (async () => {
    await initLoad();
  })();
});
