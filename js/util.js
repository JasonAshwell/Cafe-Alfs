/* ============================================================
   util.js - small DOM & formatting helpers used across views
   ============================================================ */
(function (global) {
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(key => {
      const val = attrs[key];
      if (val === null || val === undefined) return; // skip falsy attrs (e.g. selected: null)
      if (key === 'class') node.className = val;
      else if (key === 'html') node.innerHTML = val;
      else if (key.startsWith('on') && typeof val === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), val);
      } else if (key === 'dataset') {
        Object.keys(val).forEach(dk => node.dataset[dk] = val[dk]);
      } else {
        node.setAttribute(key, val);
      }
    });
    (children || []).forEach(c => {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function fmtDate(dStr) {
    const d = App.Scheduler.parseDateStr(dStr);
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  }

  function fmtDateShort(dStr) {
    const d = App.Scheduler.parseDateStr(dStr);
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
  }

  function fmtTime(iso) {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  function fmtDateTime(iso) {
    return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function todayStr() {
    return App.Scheduler.dateStr(new Date());
  }

  function fmtMinutes(mins) {
    mins = Math.round(mins || 0);
    if (mins < 60) return mins + ' min';
    const h = Math.floor(mins / 60), m = mins % 60;
    return h + 'h' + (m ? ' ' + m + 'm' : '');
  }

  function statusBadge(status) {
    const map = {
      completed: ['badge badge-completed', 'Completed'],
      skipped: ['badge badge-skipped', 'Skipped'],
      overdue: ['badge badge-overdue', 'Overdue'],
      due_today: ['badge badge-due', 'Due today'],
      upcoming: ['badge badge-upcoming', 'Upcoming']
    };
    const pair = map[status] || ['badge', status];
    const cls = pair[0], label = pair[1];
    return el('span', { class: cls }, [label]);
  }

  function toast(msg, kind) {
    const container = document.getElementById('toast-container');
    if (!container) { alert(msg); return; }
    const t = el('div', { class: 'toast ' + (kind || '') }, [msg]);
    container.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
  }

  function confirmAction(msg) {
    return window.confirm(msg);
  }

  function openModal(title, bodyNode, opts) {
    opts = opts || {};
    const overlay = el('div', { class: 'modal-overlay' }, []);
    const closeFn = () => overlay.remove();
    const footerBtns = [
      el('button', { class: 'btn btn-ghost', onClick: closeFn }, ['Cancel'])
    ];
    if (opts.onSave) {
      footerBtns.push(el('button', {
        class: 'btn btn-primary', onClick: () => {
          const result = opts.onSave();
          if (result !== false) closeFn();
        }
      }, [opts.saveLabel || 'Save']));
    }
    const modal = el('div', { class: 'modal' }, [
      el('div', { class: 'modal-header' }, [el('h2', {}, [title]), el('button', { class: 'modal-close', onClick: closeFn }, ['x'])]),
      el('div', { class: 'modal-body' }, [bodyNode]),
      el('div', { class: 'modal-footer' }, footerBtns)
    ]);
    overlay.appendChild(modal);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeFn(); });
    document.body.appendChild(overlay);
    return closeFn;
  }

  function csvDownload(filename, rows) {
    const lines = rows.map(function (r) {
      return r.map(function (cell) {
        const s = String(cell === undefined || cell === null ? '' : cell);
        const needsQuotes = s.indexOf('"') !== -1 || s.indexOf(',') !== -1 || s.indexOf('\n') !== -1;
        return needsQuotes ? '"' + s.split('"').join('""') + '"' : s;
      }).join(',');
    });
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename }, []);
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  global.App = global.App || {};
  global.App.Util = { el: el, fmtDate: fmtDate, fmtDateShort: fmtDateShort, fmtTime: fmtTime, fmtDateTime: fmtDateTime, todayStr: todayStr, fmtMinutes: fmtMinutes, statusBadge: statusBadge, toast: toast, confirmAction: confirmAction, openModal: openModal, csvDownload: csvDownload };
})(window);
