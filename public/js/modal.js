/* ============ 通用模态框工具（取代浏览器原生 alert/confirm）============
 *
 * 用法:
 *   const ok = await window.confirmModal({
 *     title: '删除站点',
 *     message: '确定要删除站点 "xxx" 吗？\n此操作不可恢复。',
 *     confirmText: '删除',
 *     cancelText: '取消',
 *     danger: true,
 *   });
 *   if (!ok) return;
 *
 *   await window.alertModal('操作成功');
 *
 * 设计:
 *   - Promise 风格，async/await 代码最干净
 *   - 同一时刻只允许一个模态框（避免叠层）
 *   - 危险操作(danger:true)确认按钮变红 + 头部图标变红
 *   - 支持 ESC 关闭、点遮罩关闭（仅当 dismissable:true，默认 false=确认对话框必须明确选择）
 *   - 焦点管理：进入时聚焦确认按钮，关闭后归还原焦点
 *   - 纯原生、零依赖
 */
(function () {
  'use strict';

  let _active = null;   // 当前打开的模态框 DOM 节点
  let _prevFocus = null;

  function _ensureContainer() {
    let c = document.getElementById('__ptka_modal_root__');
    if (!c) {
      c = document.createElement('div');
      c.id = '__ptka_modal_root__';
      document.body.appendChild(c);
    }
    return c;
  }

  function _close(overlay, returnValue) {
    if (!overlay || !overlay.isConnected) return;
    overlay.classList.remove('modal-show');
    // 等过渡结束再移除
    setTimeout(() => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (_active === overlay) _active = null;
      if (_prevFocus && typeof _prevFocus.focus === 'function') {
        try { _prevFocus.focus(); } catch (_) {}
      }
      _prevFocus = null;
    }, 200);
    if (overlay._resolver) {
      overlay._resolver(returnValue);
      overlay._resolver = null;
    }
  }

  function _build({ title, message, confirmText, cancelText, danger, dismissable, showCancel }) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    if (title) overlay.setAttribute('aria-label', title);

    const icon = danger ? '!' : 'i';
    const iconLabel = danger ? '!' : 'ⓘ';
    const showX = !!dismissable;  // 只有可关闭的模态框才显示右上角 X

    overlay.innerHTML = `
      <div class="modal-card" role="document">
        <div class="modal-header">
          <div class="modal-icon ${danger ? 'modal-icon-danger' : ''}" aria-hidden="true">${iconLabel}</div>
          <div class="modal-title">${_esc(title || '提示')}</div>
          ${showX ? '<button class="modal-close" type="button" aria-label="关闭">×</button>' : ''}
        </div>
        <div class="modal-body">${_esc(message || '')}</div>
        <div class="modal-footer">
          ${showCancel ? `<button class="modal-btn modal-btn-cancel" data-act="cancel" type="button">${_esc(cancelText || '取消')}</button>` : ''}
          <button class="modal-btn ${danger ? 'modal-btn-danger' : 'modal-btn-confirm'}" data-act="confirm" type="button">${_esc(confirmText || '确定')}</button>
        </div>
      </div>
    `;

    return overlay;
  }

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function _show(opts) {
    // 同一时刻只允许一个模态框
    if (_active && _active.isConnected) {
      // 把老的直接关掉（视为取消）
      _close(_active, opts._returnOnReplace === undefined ? false : opts._returnOnReplace);
    }
    const o = {
      title: '',
      message: '',
      confirmText: '确定',
      cancelText: '取消',
      danger: false,
      dismissable: false,   // 默认必须明确选择，alertModal 设为 true
      showCancel: true,
      ...opts,
    };
    const overlay = _build(o);
    _ensureContainer().appendChild(overlay);
    _active = overlay;
    _prevFocus = document.activeElement;

    return new Promise((resolve) => {
      overlay._resolver = resolve;

      const onClick = (e) => {
        const btn = e.target.closest('button[data-act]');
        if (btn) {
          _close(overlay, btn.dataset.act === 'confirm');
          return;
        }
        if (e.target.classList && e.target.classList.contains('modal-close')) {
          _close(overlay, false);
          return;
        }
        if (e.target === overlay && o.dismissable) {
          _close(overlay, false);
        }
      };
      const onKey = (e) => {
        if (e.key === 'Escape') {
          // ESC 行为：dismissable 时关闭返回 false；否则仅在多按钮时有 cancel 才返回 false
          if (o.dismissable || o.showCancel) {
            _close(overlay, false);
          }
        } else if (e.key === 'Enter') {
          // Enter 直接确认（焦点在卡片内或确认按钮上都算）
          const tag = (document.activeElement && document.activeElement.tagName) || '';
          if (tag !== 'BUTTON' || document.activeElement.dataset.act === 'confirm') {
            _close(overlay, true);
          }
        }
      };
      overlay.addEventListener('click', onClick);
      overlay.addEventListener('keydown', onKey);

      // 显示动画
      requestAnimationFrame(() => overlay.classList.add('modal-show'));

      // 焦点：进卡片容器，落到确认按钮
      setTimeout(() => {
        const confirmBtn = overlay.querySelector('button[data-act="confirm"]');
        if (confirmBtn) {
          try { confirmBtn.focus(); } catch (_) {}
        }
      }, 30);
    });
  }

  /**
   * 确认对话框，返回 Promise<boolean>。
   * danger:true 时确认按钮变红（用于删除等不可恢复操作）。
   */
  function confirmModal(opts) {
    return _show({ ...(opts || {}), showCancel: true });
  }

  /**
   * 纯提示对话框，无取消按钮，OK 关闭或 ESC/点遮罩关闭均返回 true。
   */
  function alertModal(message, opts) {
    return _show({
      ...(opts || {}),
      message: typeof opts === 'string' ? opts : message,
      showCancel: false,
      confirmText: (opts && opts.confirmText) || '知道了',
      dismissable: true,
    });
  }

  window.confirmModal = confirmModal;
  window.alertModal = alertModal;
})();
