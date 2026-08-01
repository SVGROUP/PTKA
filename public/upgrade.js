document.addEventListener('DOMContentLoaded', () => {
  const messageContainer = document.getElementById('message-container');
  const container = document.getElementById('updates-container');
  const historyContainer = document.getElementById('history-container');
  const upgradeAllBtn = document.getElementById('upgrade-all');
  const refreshBtn = document.getElementById('refresh-list');
  const refreshHistoryBtn = document.getElementById('refresh-history');
  const deleteModeBtn = document.getElementById('delete-mode-toggle');

  // 删除模式开关：开启后隐藏每个卡片的“移除”按钮，改在右侧显式一个“删除”按钮；
  // 再次点击按钮退出删除模式（状态在 reload 之前保留，刷新列表不会丢）。
  let deleteMode = false;
  if (deleteModeBtn) {
    const applyBtnState = () => {
      deleteModeBtn.classList.toggle('active', deleteMode);
      deleteModeBtn.setAttribute('aria-pressed', deleteMode ? 'true' : 'false');
      deleteModeBtn.textContent = deleteMode ? '退出删除模式' : '删除记录';
      document.body.classList.toggle('delete-mode-on', deleteMode);
    };
    deleteModeBtn.addEventListener('click', () => {
      deleteMode = !deleteMode;
      applyBtnState();
      // 模式切换后顺手重渲染，让隐藏/显示生效
      loadList();
    });
    applyBtnState();
  }

  function showMessage(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `message-toast ${type}`;
    toast.textContent = message;
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

  function formatTime(ts) {
    if (!ts) return '-';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  async function loadList() {
    try {
      const res = await fetch('/api/upgrade/list');
      const json = await res.json();
      render(json.data || []);
    } catch (e) {
      showMessage('加载失败: ' + e.message, 'error');
    }
  }

  function render(list) {
    if (!list.length) {
      container.innerHTML = '<div class="empty-message">暂无待升级镜像，一切都是最新的 🎉</div>';
      return;
    }
    container.innerHTML = list.map(item => {
      const handled = item.handled;
      const badge = handled
        ? '<span class="status-badge success">已升级</span>'
        : '<span class="status-badge unknown">待升级</span>';
      const timeLine = handled
        ? `升级于 ${formatTime(item.handledAt)}`
        : `发现于 ${formatTime(item.detectedAt)}`;
      // 按钮规则（2026-08-01 重构）：
      //   默认：只对“待升级”卡片显示「升级」按钮，“已升级”不显任何按钮（避免误删）。
      //   删除模式：所有卡片右侧显示「移除」按钮；升级按钮隐藏，避免误点。
      let actions = '';
      if (deleteMode) {
        actions = `<button class="btn btn-danger btn-sm btn-remove" data-container="${escapeHtml(item.containerName)}">移除</button>`;
      } else if (!handled) {
        actions = `<button class="btn btn-primary btn-sm btn-upgrade" data-container="${escapeHtml(item.containerName)}">升级</button>`;
      }
      return `
        <div class="site-item${deleteMode ? ' delete-mode' : ''}">
          <div class="site-info">
            <div class="site-name">${escapeHtml(item.containerName)} ${badge}</div>
            <div class="site-url">${escapeHtml(item.imageName || '(镜像未知)')}</div>
            <div class="site-key">${escapeHtml(item.status || '')} · ${timeLine}</div>
          </div>
          <div class="site-actions">
            ${actions}
          </div>
        </div>`;
    }).join('');

    container.querySelectorAll('.btn-upgrade').forEach(btn => {
      btn.addEventListener('click', () => doUpgrade(btn.dataset.container, btn));
    });
    container.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', () => doRemove(btn.dataset.container));
    });
  }

  async function loadHistory() {
    try {
      const res = await fetch('/api/upgrade/history');
      const json = await res.json();
      renderHistory(json.data || []);
    } catch (e) {
      if (historyContainer) {
        historyContainer.innerHTML = '<div class="empty-message">历史加载失败: ' + escapeHtml(e.message) + '</div>';
      }
    }
  }

  function renderHistory(list) {
    if (!historyContainer) return;
    if (!list.length) {
      historyContainer.innerHTML = '<div class="empty-message">暂无版本变迁记录</div>';
      return;
    }
    historyContainer.innerHTML = list.map(item => {
      const from = item.fromTag ? escapeHtml(item.fromTag) : '(未知)';
      const to = item.toTag ? escapeHtml(item.toTag) : '(未匹配到具名tag)';
      const digest = item.digest ? String(item.digest).slice(0, 12) : '';
      const title = escapeHtml(item.imageName || item.imageKey || '');
      return `
        <div class="site-item">
          <div class="site-info">
            <div class="site-name">${title}</div>
            <div class="site-url"><b>${from}</b> → <b>${to}</b></div>
            <div class="site-key">${escapeHtml(formatTime(item.recordedAt))}${digest ? ' · ' + escapeHtml(digest) : ''}</div>
          </div>
        </div>`;
    }).join('');
  }

  async function doUpgrade(name, btn) {
    const ok = await window.confirmModal({
      title: '升级镜像',
      message: `确认升级镜像 "${name}" ？会拉取新镜像并重建对应容器。`,
      confirmText: '升级',
      cancelText: '取消',
    });
    if (!ok) return;
    btn.disabled = true;
    btn.textContent = '升级中...';
    try {
      const res = await fetch('/api/upgrade/do', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ container: name })
      });
      const json = await res.json();
      if (json.success) {
        showMessage(json.message || '已触发升级', 'success');
      } else {
        showMessage(json.message || '升级失败', 'error');
      }
    } catch (e) {
      showMessage('升级请求失败: ' + e.message, 'error');
    } finally {
      loadList();
    }
  }

  async function doRemove(name) {
    const ok = await window.confirmModal({
      title: '移除记录',
      message: `确认移除镜像记录 "${name}" ？仅从本页面列表删除，不会动 Docker。`,
      confirmText: '移除',
      cancelText: '取消',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch('/api/upgrade/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ container: name })
      });
      const json = await res.json();
      showMessage(json.message || '已移除', json.success ? 'success' : 'error');
    } catch (e) {
      showMessage('移除失败: ' + e.message, 'error');
    } finally {
      loadList();
    }
  }

  async function upgradeAll() {
    const ok = await window.confirmModal({
      title: '升级所有容器',
      message: '确认升级【所有】监控中的容器？这会拉取并重建它们。',
      confirmText: '全部升级',
      cancelText: '取消',
      danger: true,
    });
    if (!ok) return;
    upgradeAllBtn.disabled = true;
    upgradeAllBtn.textContent = '升级中...';
    try {
      const res = await fetch('/api/upgrade/all', { method: 'POST' });
      const json = await res.json();
      showMessage(json.message || (json.success ? '已触发全部升级' : '升级失败'),
                  json.success ? 'success' : 'error');
    } catch (e) {
      showMessage('升级请求失败: ' + e.message, 'error');
    } finally {
      upgradeAllBtn.disabled = false;
      upgradeAllBtn.textContent = '一键全部升级';
      loadList();
    }
  }

  // ---- 部署 watchtower-trigger 升级容器命令 ----
  const triggerCmdEl = document.getElementById('trigger-cmd');
  const copyTriggerBtn = document.getElementById('copy-trigger');
  let triggerCmdText = '';

  async function loadDeployCmd() {
    try {
      const res = await fetch('/api/upgrade/deploy-cmd');
      const json = await res.json();
      triggerCmdText = json.triggerCmd || '';
      triggerCmdEl.textContent = triggerCmdText || '(未获取到命令)';
    } catch (e) {
      triggerCmdEl.textContent = '加载命令失败: ' + e.message;
    }
  }

  async function copyText(text, el) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showMessage('命令已复制到剪贴板', 'success');
    } catch (e) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      showMessage('已选中命令，请手动复制 (Ctrl+C)', 'info');
    }
  }

  if (copyTriggerBtn) {
    copyTriggerBtn.addEventListener('click', () => copyText(triggerCmdText, triggerCmdEl));
    loadDeployCmd();
  }

  upgradeAllBtn.addEventListener('click', upgradeAll);
  refreshBtn.addEventListener('click', loadList);
  if (refreshHistoryBtn) refreshHistoryBtn.addEventListener('click', loadHistory);
  loadList();
  loadHistory();
});
