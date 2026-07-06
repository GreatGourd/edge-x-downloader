// X Media Downloader — 页面主世界 Hook (src/hook.js)
// 运行在 MAIN world，可以拦截 XHR/fetch
// 通过 window.postMessage 传回数据给隔离世界的 content script
"use strict";

(function() {
  // 递归提取媒体数据
  function extractMedia(obj, depth) {
    if (depth > 15 || !obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length; i++) {
        var item = obj[i];
        if (item && typeof item === 'object' && item.media_url_https) processItem(item);
        extractMedia(item, depth + 1);
      }
    } else {
      if (obj.media_url_https) processItem(obj);
      for (var k in obj) {
        if (!obj.hasOwnProperty(k)) continue;
        var val = obj[k];
        if (k === 'entries' || k === 'instructions' || k === 'moduleItems') {
          extractMedia(val, depth);
        } else if (typeof val === 'object' && val !== null) {
          extractMedia(val, depth + 1);
        }
      }
    }
  }

  function processItem(m) {
    if (!m.media_url_https) return;
    var parts = m.media_url_https.split('/').pop().split('?')[0];
    if (!parts) return;
    var variants = [];
    if ((m.type === 'video' || m.type === 'animated_gif') && m.video_info && m.video_info.variants) {
      for (var i = 0; i < m.video_info.variants.length; i++) {
        var v = m.video_info.variants[i];
        if (v.url && v.url.indexOf('.m3u8') < 0) {
          variants.push({ bitrate: v.bitrate || 0, url: v.url });
        }
      }
    }
    window.postMessage({
      type: 'xdl_media',
      key: parts,
      mediaType: m.type || 'photo',
      variants: variants
    }, '*');
  }

  // ====== XHR Hook ======
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    if (url && typeof url === 'string' && url.indexOf('/graphql/') >= 0) {
      var xhr = this;
      var origOnReadyStateChange = xhr.onreadystatechange;
      xhr.addEventListener('load', function() {
        try {
          var text = xhr.responseText;
          if (text && text.length > 100) {
            extractMedia(JSON.parse(text), 0);
          }
        } catch(e) {}
      });
    }
    origOpen.apply(this, arguments);
  };

  // ====== fetch Hook ======
  var origFetch = window.fetch;
  window.fetch = function(input, init) {
    var url = (typeof input === 'string' ? input : (input && input.url)) || '';
    if (url && url.indexOf('/graphql/') >= 0) {
      return origFetch.apply(this, arguments).then(function(response) {
        try {
          var clone = response.clone();
          clone.text().then(function(text) {
            if (text && text.length > 100) {
              extractMedia(JSON.parse(text), 0);
            }
          });
        } catch(e) {}
        return response;
      });
    }
    return origFetch.apply(this, arguments);
  };

  console.log('[XDL] MAIN world hooks installed');
})();