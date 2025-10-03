// helpers.js
// Pure helper functions for file handling, exif parsing, image cleaning, and storage.
// Uses jQuery where DOM interaction is required; otherwise plain JS.

/* Expose Helpers on window.Helpers so other modules can call utility functions. */
window.Helpers = window.Helpers || {};

(function (H, $) {
  'use strict';

  // Safe localStorage wrapper
  H.storage = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        console.error('Storage.get failed', e);
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        console.error('Storage.set failed', e);
      }
    }
  };

  // Read a File as ArrayBuffer
  H.readArrayBuffer = function (file) {
    return new Promise(function (resolve, reject) {
      const fr = new FileReader();
      fr.onerror = function () { reject(new Error('Failed to read file as ArrayBuffer')); };
      fr.onload = function () { resolve(fr.result); };
      fr.readAsArrayBuffer(file);
    });
  };

  // Read a File as DataURL for thumbnails
  H.readDataURL = function (file) {
    return new Promise(function (resolve, reject) {
      const fr = new FileReader();
      fr.onerror = function () { reject(new Error('Failed to read file as DataURL')); };
      fr.onload = function () { resolve(fr.result); };
      fr.readAsDataURL(file);
    });
  };

  // Format bytes human-friendly
  H.formatBytes = function (bytes) {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Read basic EXIF orientation from JPEG ArrayBuffer. Returns orientation number 1-8 or 1 by default.
  H.getOrientation = function (arrayBuffer) {
    try {
      const view = new DataView(arrayBuffer);
      if (view.getUint16(0, false) !== 0xFFD8) return 1; // not JPEG
      let offset = 2;
      const length = view.byteLength;
      while (offset < length) {
        if (view.getUint16(offset + 2, false) <= 8) return 1;
        const marker = view.getUint16(offset, false);
        offset += 2;
        if (marker === 0xFFE1) {
          // APP1 found
          const app1Length = view.getUint16(offset, false);
          offset += 2;
          const exifHeader = offset;
          if (view.getUint32(offset, false) !== 0x45786966) return 1; // not "Exif"
          offset += 6; // skip "Exif\0\0"
          const little = view.getUint16(offset, false) === 0x4949;
          offset += view.getUint32(offset + 4, little);
          const tags = view.getUint16(offset, little);
          offset += 2;
          for (let i = 0; i < tags; i++) {
            const tagOffset = offset + i * 12;
            const tag = view.getUint16(tagOffset, little);
            if (tag === 0x0112) {
              const orientation = view.getUint16(tagOffset + 8, little);
              return orientation || 1;
            }
          }
        } else if ((marker & 0xFF00) !== 0xFF00) break;
        else offset += view.getUint16(offset, false);
      }
    } catch (e) {
      console.warn('Orientation read failed', e);
    }
    return 1;
  };

  // Create an Image element from a Blob or DataURL
  H.createImage = function (source) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function (e) { reject(new Error('Image load failed')); };
      img.crossOrigin = 'anonymous';
      img.src = source;
    });
  };

  // Draw image into canvas, preserving orientation, and return a Blob of cleaned image (metadata removed)
  H.cleanImage = async function (file, options) {
    options = options || {};
    const quality = typeof options.quality === 'number' ? options.quality : 0.92;
    const maxWidth = options.maxWidth || 0; // 0 means keep original

    let arrayBuffer;
    try {
      arrayBuffer = await H.readArrayBuffer(file);
    } catch (e) {
      throw new Error('Failed to read file to clean');
    }

    const orientation = H.getOrientation(arrayBuffer) || 1;

    // Read as dataURL for image creation
    const dataURL = await H.readDataURL(file);
    const img = await H.createImage(dataURL);

    // Determine target dimensions
    let sw = img.naturalWidth;
    let sh = img.naturalHeight;
    let dw = sw;
    let dh = sh;

    if (maxWidth > 0 && dw > maxWidth) {
      const ratio = maxWidth / dw;
      dw = Math.round(dw * ratio);
      dh = Math.round(dh * ratio);
    }

    // For orientations that rotate, swap width/height
    const rotated = [5,6,7,8].indexOf(orientation) >= 0;
    const canvas = document.createElement('canvas');
    canvas.width = rotated ? dh : dw;
    canvas.height = rotated ? dw : dh;
    const ctx = canvas.getContext('2d');

    // Apply transform based on EXIF orientation
    switch (orientation) {
      case 2: ctx.transform(-1, 0, 0, 1, canvas.width, 0); break; // flip horizontal
      case 3: ctx.transform(-1, 0, 0, -1, canvas.width, canvas.height); break; // rotate 180
      case 4: ctx.transform(1, 0, 0, -1, 0, canvas.height); break; // flip vertical
      case 5: ctx.transform(0, 1, 1, 0, 0, 0); break; // transpose
      case 6: ctx.transform(0, 1, -1, 0, canvas.height, 0); break; // rotate 90
      case 7: ctx.transform(0, -1, -1, 0, canvas.height, canvas.width); break; // transverse
      case 8: ctx.transform(0, -1, 1, 0, 0, canvas.width); break; // rotate 270
      default: break; // 1 - no transform
    }

    // Draw image into canvas scaled to requested size while respecting orientation transform
    try {
      ctx.drawImage(img, 0, 0, sw, sh, 0, 0, dw, dh);
    } catch (e) {
      // fallback simple draw
      ctx.drawImage(img, 0, 0);
    }

    // Export blob - prefer original mime type when possible
    const outType = (file.type === 'image/png' || file.type === 'image/webp') ? file.type : 'image/jpeg';

    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) return reject(new Error('Failed to export cleaned blob'));
        // Choose a safe filename
        const ext = outType === 'image/png' ? 'png' : (outType === 'image/webp' ? 'webp' : 'jpg');
        const cleanedName = (file.name || 'image') .replace(/\.[^/.]+$/, '') + '.cleaned.' + ext;
        resolve({ blob: blob, cleanedName: cleanedName, mime: outType, width: canvas.width, height: canvas.height });
      }, outType, quality);
    });
  };

  // Create downloadable object URL and auto-revoke after some time to free memory
  H.createDownloadLink = function (blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    return { url: url, anchor: a };
  };

  // Create a simple single-file gallery HTML that embeds base64 images for bulk export
  H.createGalleryHTML = async function (items) {
    // items: [{name, dataURL, width, height}]
    const now = new Date();
    const title = 'Cleaned Photos - ' + now.toLocaleString();
    const html = [`<!doctype html>`, `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;background:#f8fafc;color:#0f172a;padding:18px}img{max-width:100%;height:auto;border-radius:8px;box-shadow:0 2px 8px rgba(2,6,23,0.06);margin-bottom:8px}figure{margin:18px 0;padding:12px;background:#fff;border-radius:10px}figcaption{color:#6b7280;font-size:13px}</style></head><body><h1>${title}</h1><div>`];
    for (const it of items) {
      html.push(`<figure><img src="${it.dataURL}" alt="${it.name}"><figcaption>${it.name} — ${it.width}x${it.height}</figcaption></figure>`);
    }
    html.push('</div></body></html>');
    return html.join('');
  };

})(window.Helpers, jQuery);
