// 站点管理页面逻辑

let sites = [];
let isEditing = false;

// 消息提示函数
function showMessage(message, type = 'success') {
  const container = document.getElementById('message-container');
  const msgEl = document.createElement('div');
  msgEl.className = `message message-${type}`;
  msgEl.textContent = message;
  container.appendChild(msgEl);

  setTimeout(() => {
    msgEl.classList.add('message-fadeout');
    setTimeout(() => msgEl.remove(), 300);
  }, 2500);
}

// 获取站点列表
async function loadSites() {
  try {
    const res = await fetch('/api/config/');
    const data = await res.json();
    if (data.success) {
      sites = data.data;
      renderSiteList();
    } else {
      showMessage(data.message, 'error');
    }
  } catch (err) {
    showMessage('加载失败: ' + err.message, 'error');
  }
}

// 渲染站点列表
function renderSiteList() {
  const listEl = document.getElementById('siteList');
  const countEl = document.getElementById('siteCount');

  countEl.textContent = sites.length;

  if (sites.length === 0) {
    listEl.innerHTML = '<div class="empty-message">暂无站点，请新增或导入站点</div>';
    return;
  }

  listEl.innerHTML = sites.map(site => `
    <div class="site-item">
      <div class="site-info">
        <div class="site-header">
          <strong class="site-name">${escapeHtml(site.siteName)}</strong>
          <span class="site-key">${escapeHtml(site.siteKey)}</span>
          <span class="site-status ${site.enabled ? 'enabled' : 'disabled'}">
            ${site.enabled ? '启用' : '禁用'}
          </span>
        </div>
        <div class="site-url">${escapeHtml(site.siteUrl)}</div>
      </div>
      <div class="site-actions">
        <button class="btn btn-sm btn-secondary" onclick="editSite(${site.id})">编辑</button>
        <button class="btn btn-sm btn-danger" onclick="deleteSite(${site.id})">删除</button>
      </div>
    </div>
  `).join('');
}

// HTML 转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 新增站点
document.getElementById('btnAddSite').addEventListener('click', () => {
  isEditing = false;
  document.getElementById('formTitle').textContent = '新增站点';
  document.getElementById('siteForm').reset();
  document.getElementById('siteId').value = '';
  document.getElementById('siteKey').disabled = false;
  document.getElementById('formCard').style.display = 'block';
  document.getElementById('siteKey').focus();
});

// 编辑站点
function editSite(id) {
  const site = sites.find(s => s.id === id);
  if (!site) return;

  isEditing = true;
  document.getElementById('formTitle').textContent = '编辑站点';
  document.getElementById('siteId').value = site.id;
  document.getElementById('siteKey').value = site.siteKey;
  document.getElementById('siteKey').disabled = true;
  document.getElementById('siteName').value = site.siteName;
  document.getElementById('siteUrl').value = site.siteUrl;
  document.getElementById('formCard').style.display = 'block';
  document.getElementById('siteName').focus();
}

// 取消
document.getElementById('btnCancel').addEventListener('click', () => {
  document.getElementById('formCard').style.display = 'none';
});

// 表单提交
document.getElementById('siteForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const siteId = document.getElementById('siteId').value;
  const siteKey = document.getElementById('siteKey').value.trim();
  const siteName = document.getElementById('siteName').value.trim();
  const siteUrl = document.getElementById('siteUrl').value.trim();

  try {
    let res;
    if (isEditing) {
      // 更新
      res = await fetch(`/api/config/${siteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteName,
          siteUrl
        })
      });
    } else {
      // 创建
      res = await fetch('/api/config/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteKey,
          siteName,
          siteUrl
        })
      });
    }

    const data = await res.json();
    if (data.success) {
      showMessage(data.message, 'success');
      document.getElementById('formCard').style.display = 'none';
      loadSites();
    } else {
      showMessage(data.message, 'error');
    }
  } catch (err) {
    showMessage('操作失败: ' + err.message, 'error');
  }
});

// 删除站点
async function deleteSite(id) {
  const site = sites.find(s => s.id === id);
  if (!site) return;

  if (!confirm(`确定要删除站点 "${site.siteName}" 吗？\n此操作不可恢复。`)) {
    return;
  }

  try {
    const res = await fetch(`/api/config/${id}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      showMessage(data.message, 'success');
      loadSites();
    } else {
      showMessage(data.message, 'error');
    }
  } catch (err) {
    showMessage('删除失败: ' + err.message, 'error');
  }
}

// 批量导入
document.getElementById('btnBatchImport').addEventListener('click', async () => {
  const text = document.getElementById('batchImportText').value.trim();
  if (!text) {
    showMessage('请输入要导入的站点数据', 'error');
    return;
  }

  const lines = text.split('\n');
  const sites = [];

  for (const line of lines) {
    const lineTrim = line.trim();
    if (!lineTrim || lineTrim.startsWith('#')) continue;

    const parts = lineTrim.split('|');
    if (parts.length >= 3) {
      sites.push({
        siteKey: parts[0].trim(),
        siteName: parts[1].trim(),
        siteUrl: parts[2].trim()
      });
    }
  }

  if (sites.length === 0) {
    showMessage('没有解析到有效的站点数据', 'error');
    return;
  }

  if (!confirm(`确定要导入 ${sites.length} 个站点吗？已存在的站点会被跳过。`)) {
    return;
  }

  try {
    const res = await fetch('/api/config/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sites })
    });
    const data = await res.json();
    if (data.success) {
      showMessage(data.message, 'success');
      document.getElementById('batchImportText').value = '';
      loadSites();
    } else {
      showMessage(data.message, 'error');
    }
  } catch (err) {
    showMessage('导入失败: ' + err.message, 'error');
  }
});

// 导入默认站点
document.getElementById('btnImportDefault').addEventListener('click', async () => {
  if (!confirm('确定要导入默认站点列表吗？会添加所有预设的PT站点，已存在的会被跳过。')) {
    return;
  }

  try {
    const res = await fetch('default_sites.txt');
    const text = await res.text();
    const lines = text.split('\n');
    const sites = [];

    for (const line of lines) {
      const lineTrim = line.trim();
      if (!lineTrim || lineTrim.startsWith('#')) continue;

      const parts = lineTrim.split('|');
      if (parts.length >= 3) {
        sites.push({
          siteKey: parts[0].trim(),
          siteName: parts[1].trim(),
          siteUrl: parts[2].trim()
        });
      }
    }

    if (sites.length === 0) {
      showMessage('默认站点列表为空', 'error');
      return;
    }

    const importRes = await fetch('/api/config/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sites })
    });
    const data = await importRes.json();
    if (data.success) {
      showMessage(data.message, 'success');
      loadSites();
    } else {
      showMessage(data.message, 'error');
    }
  } catch (err) {
    showMessage('导入失败: ' + err.message, 'error');
  }
});

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  loadSites();
});
