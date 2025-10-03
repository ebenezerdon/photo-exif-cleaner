(function (window, $) {
  'use strict';

  // App UI helpers: render file list, preview, session list
  const AppUI = {
    state: {
      files: [] // {file, dataURL?, selected:bool}
    }
  };

  // Create a compact file item element (returns jQuery element)
  AppUI.createFileElement = function (item, index) {
    const file = item.file;
    const $wrap = $(
      `<div class="file-item p-2 bg-white" tabindex="0" role="button" data-index="${index}" aria-pressed="false">
        <div class="flex items-center">
          <input type="checkbox" class="mr-3 file-select" data-index="${index}" ${item.selected ? 'checked' : ''} aria-label="Select ${file.name}" />
          <img src="${item.dataURL || ''}" alt="thumb" class="file-thumb mr-3" />
          <div class="flex-1">
            <div class="font-medium text-sm truncate">${escapeHtml(file.name)}</div>
            <div class="small-muted">${escapeHtml(formatBytes(file.size))} · ${escapeHtml(file.type || '')}</div>
          </div>
          <div class="ml-3 small-muted text-xs">${escapeHtml((item.cleanedName || ''))}</div>
        </div>
      </div>`
    );

    return $wrap;
  };

  AppUI.renderFileList = function () {
    const $list = $('#fileList');
    $list.empty();
    if (!AppUI.state.files.length) {
      $list.append('<div class="muted">No files selected. Drop images or click Select images.</div>');
      return;
    }
    for (let i = 0; i < AppUI.state.files.length; i++) {
      const item = AppUI.state.files[i];
      const $el = AppUI.createFileElement(item, i);
      $list.append($el);
    }
  };

  AppUI.showPreview = function (index) {
    const it = AppUI.state.files[index];
    if (!it) return;
    const file = it.file;
    const $p = $('#previewArea');
    $p.empty();
    const $holder = $("<div></div>");
    if (it.dataURL) {
      $holder.append(`<img class=\"preview-img\" src=\"${it.dataURL}\" alt=\"Preview of ${escapeHtml(file.name)}\">`);
    } else {
      $holder.append('<div class="muted">Loading preview…</div>');
    }
    const info = $(`<div class=\"mt-3 small-muted\"><strong>${escapeHtml(file.name)}</strong><div>${escapeHtml(formatBytes(file.size))} · ${escapeHtml(file.type || '')}</div></div>`);
    $p.append($holder).append(info);
  };

  AppUI.renderSessionList = function (sessions) {
    const $s = $('#sessionList');
    $s.empty();
    if (!sessions || !sessions.length) {
      $s.append('<div class="muted text-sm">No recent sessions</div>');
      return;
    }
    for (const s of sessions) {
      const $row = $(`<div class=\"small-muted text-sm py-1\">${escapeHtml(s.join(', '))}</div>`);
      $s.append($row);
    }
  };

  // Utilities
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>\"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Expose
  window.AppUI = AppUI;

})(window, jQuery);
