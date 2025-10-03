(function (Helpers, $, AppUI) {
  'use strict';

  const STATE = {
    files: [] // {file, dataURL, selected, cleanedBlob?, cleanedName?}
  };

  // Initialize UI and bind events
  $(function () {
    // Wire file picker
    $('#filePicker').on('change', function (e) {
      const files = Array.from(e.target.files || []);
      if (files.length) addFiles(files);
      // reset input so same file can be re-selected
      $(this).val('');
    });

    // Dropzone drag/drop
    const $dz = $('#dropzone');
    $dz.on('dragover', function (e) { e.preventDefault(); e.originalEvent.dataTransfer.dropEffect = 'copy'; $(this).addClass('dragover'); });
    $dz.on('dragenter', function (e) { e.preventDefault(); $(this).addClass('dragover'); });
    $dz.on('dragleave drop', function (e) { e.preventDefault(); $(this).removeClass('dragover'); });
    $dz.on('drop', function (e) {
      e.preventDefault();
      const dt = e.originalEvent.dataTransfer;
      const files = Array.from(dt.files || []).filter(f => f && f.type && f.type.indexOf('image') === 0);
      if (files.length) addFiles(files);
    });

    // Accessibility: allow Enter/Space to open file picker when dropzone focused
    $dz.on('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#filePicker').trigger('click'); }
    });

    // Delegate clicks on file items for preview/select
    $('#fileList').on('click', '.file-item', function (e) {
      const idx = Number($(this).attr('data-index'));
      if (isNaN(idx)) return;
      // if click was on checkbox, toggle selection only
      if ($(e.target).is('input[type=checkbox]')) {
        toggleSelect(idx);
        return;
      }
      // otherwise show preview and toggle selection
      AppUI.showPreview(idx);
    });

    // Delegate checkbox toggles
    $('#fileList').on('change', '.file-select', function () {
      const idx = Number($(this).attr('data-index'));
      if (!Number.isNaN(idx)) {
        STATE.files[idx].selected = $(this).is(':checked');
      }
    });

    // Quality slider
    $('#qualityRange').on('input change', function () {
      $('#qualityValue').text($(this).val());
    });

    // Actions
    $('#cleanSelected').on('click', async function () {
      const selected = STATE.files.map((f, i) => ({ f, i })).filter(x => x.f.selected);
      if (!selected.length) return announce('No images selected to clean.');
      $(this).attr('aria-disabled', 'true');
      $(this).prop('disabled', true);
      announce('Cleaning images...');
      const quality = parseFloat($('#qualityRange').val()) || 0.92;
      try {
        for (const s of selected) {
          const file = s.f.file;
          // run cleaning
          const out = await Helpers.cleanImage(file, { quality: quality });
          s.f.cleanedBlob = out.blob;
          s.f.cleanedName = out.cleanedName;
          // create a temporary download link and trigger
          const dl = Helpers.createDownloadLink(out.blob, out.cleanedName);
          // append and click to trigger download
          document.body.appendChild(dl.anchor);
          dl.anchor.style.display = 'none';
          dl.anchor.click();
          // cleanup
          setTimeout(() => { URL.revokeObjectURL(dl.url); try { dl.anchor.remove(); } catch (e) {} }, 3000);
        }
        announce('Cleaning complete. Files downloaded.');
      } catch (err) {
        console.error(err);
        announce('Error while cleaning images. See console for details.');
      } finally {
        $('#cleanSelected').attr('aria-disabled', 'false');
        $('#cleanSelected').prop('disabled', false);
      }
    });

    $('#downloadAll').on('click', async function () {
      // create gallery with cleaned images embedded
      const selected = STATE.files.filter(f => f.selected);
      if (!selected.length) return announce('No images selected to download.');
      announce('Preparing gallery...');
      const quality = parseFloat($('#qualityRange').val()) || 0.92;
      const items = [];
      try {
        for (const it of selected) {
          let blob;
          if (it.cleanedBlob) {
            blob = it.cleanedBlob;
          } else {
            const res = await Helpers.cleanImage(it.file, { quality: quality });
            blob = res.blob;
            it.cleanedBlob = blob;
            it.cleanedName = res.cleanedName;
          }
          // convert blob to dataURL
          const dataURL = await blobToDataURL(blob);
          items.push({ name: it.cleanedName || it.file.name, dataURL: dataURL, width: it.width || 0, height: it.height || 0 });
        }
        const html = await Helpers.createGalleryHTML(items);
        const galleryBlob = new Blob([html], { type: 'text/html' });
        const dl = Helpers.createDownloadLink(galleryBlob, 'cleaned-gallery.html');
        document.body.appendChild(dl.anchor);
        dl.anchor.style.display = 'none';
        dl.anchor.click();
        setTimeout(() => { URL.revokeObjectURL(dl.url); try { dl.anchor.remove(); } catch (e) {} }, 3000);
        announce('Gallery download started.');
      } catch (err) {
        console.error(err);
        announce('Failed to create gallery.');
      }
    });

    // Load sessions and render
    const sessions = Helpers.storage.get('recentSessions', []);
    AppUI.renderSessionList(sessions);
  });

  // Helpers
  function addFiles(files) {
    const imageFiles = files.filter(f => f && f.type && f.type.indexOf('image') === 0);
    if (!imageFiles.length) return announce('No image files found.');
    const startIdx = STATE.files.length;
    for (const f of imageFiles) {
      STATE.files.push({ file: f, selected: true, dataURL: null });
    }
    const promises = [];
    for (let i = startIdx; i < STATE.files.length; i++) {
      const idx = i;
      // read quick dataURL for thumbnail asynchronously
      promises.push((async () => {
        try {
          const dataURL = await Helpers.readDataURL(STATE.files[idx].file);
          STATE.files[idx].dataURL = dataURL;
        } catch (e) {
          STATE.files[idx].dataURL = '';
        }
      })());
    }
    // once thumbnails available render
    Promise.all(promises).then(() => {
      // copy into AppUI state for rendering convenience
      AppUI.state.files = STATE.files;
      AppUI.renderFileList();
      // persist simple session info (filenames only)
      try {
        const names = STATE.files.map(x => x.file.name).slice(-10);
        let sessions = Helpers.storage.get('recentSessions', []);
        sessions.unshift(names);
        // keep limited history
        sessions = sessions.slice(0, 6);
        Helpers.storage.set('recentSessions', sessions);
        AppUI.renderSessionList(sessions);
      } catch (e) {
        // ignore storage errors
      }
    });
  }

  function toggleSelect(idx) {
    if (!STATE.files[idx]) return;
    STATE.files[idx].selected = !STATE.files[idx].selected;
    AppUI.state.files = STATE.files;
    AppUI.renderFileList();
  }

  function announce(msg) {
    // put brief message into live region
    const $live = $('<div class="sr-only sr-only-focusable" aria-live="polite">' + escapeHtml(msg) + '</div>');
    $('body').append($live);
    setTimeout(() => { $live.remove(); }, 2500);
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error('Failed to convert blob to dataURL')); };
      fr.readAsDataURL(blob);
    });
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>\"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

})(window.Helpers, jQuery, window.AppUI);
