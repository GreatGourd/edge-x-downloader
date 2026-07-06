// X Media Downloader — Content Script (v9 ISOLATED world)
// 点击书签按钮 → 直接下载所有媒体 + 正常书签
// 无弹窗，无浮动按钮

(function () {
  'use strict';

  // ================================================================
  // 媒体缓存（由 hook.js 通过 postMessage 填充）
  // ================================================================
  const mediaInfoCache = new Map();

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const d = event.data;
    if (d && d.type === 'xdl_media' && d.key) {
      mediaInfoCache.set(d.key, { mediaType: d.mediaType, variants: d.variants || [] });
    }
  });

  // ================================================================
  // Toast
  // ================================================================
  const CSS = `
    .xdl-toast {
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      background: rgba(0,0,0,0.85); color: #fff;
      padding: 10px 22px; border-radius: 10px;
      font: 500 14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
      z-index: 2147483647; pointer-events: none;
      animation: xdl-fade 2.8s ease forwards;
    }
    @keyframes xdl-fade { 0%{opacity:0;transform:translateX(-50%)translateY(12px)} 12%{opacity:1;transform:translateX(-50%)translateY(0)} 75%{opacity:1} 100%{opacity:0;transform:translateX(-50%)translateY(-8px)} }
  `;

  function injectCSS() {
    const s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function showToast(msg) {
    const old = document.querySelector('.xdl-toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.className = 'xdl-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { if (t.parentNode) t.remove(); }, 3000);
  }

  // ================================================================
  // 图片 URL
  // ================================================================
  function getBestImageUrl(img) {
    const src = img.src || img.getAttribute('src') || '';
    if (!src.includes('twimg.com')) return src;
    try {
      const url = new URL(src);
      url.searchParams.delete('name');
      url.searchParams.set('name', 'orig');
      return url.toString();
    } catch { return src; }
  }

  // ================================================================
  // 从贴文中提取媒体列表
  // ================================================================
  function getMediaList(tweetArticle) {
    const list = [];

    // 图片
    tweetArticle.querySelectorAll('[data-testid="tweetPhoto"] img[src*="twimg.com"]').forEach(img => {
      list.push({ type: 'image', url: getBestImageUrl(img) });
    });

    // 视频
    tweetArticle.querySelectorAll('[data-testid="videoPlayer"], [data-testid="videoComponent"]').forEach(cont => {
      const video = cont.querySelector('video');
      if (!video) return;
      const posterFile = video.poster ? video.poster.split('/').pop().split('?')[0] : '';
      let bestUrl = '';

      if (posterFile && mediaInfoCache.has(posterFile)) {
        const cached = mediaInfoCache.get(posterFile);
        if (cached.variants.length > 0) {
          bestUrl = cached.variants.sort((a, b) => b.bitrate - a.bitrate)[0].url;
        }
      }
      if (!bestUrl && posterFile) {
        for (const [key, cached] of mediaInfoCache) {
          if (posterFile.includes(key) || key.includes(posterFile)) {
            if (cached.variants.length > 0) {
              bestUrl = cached.variants.sort((a, b) => b.bitrate - a.bitrate)[0].url;
              break;
            }
          }
        }
      }

      if (bestUrl) list.push({ type: 'video', url: bestUrl });
    });

    return list;
  }

  // ================================================================
  // 获取文件名
  // ================================================================
  function getFilename(url, type) {
    try {
      const u = new URL(url);
      let name = u.pathname.split('/').pop() || '';
      if (name.includes('?')) name = name.split('?')[0];
      if (!name.includes('.')) name += type === 'image' ? '.jpg' : '.mp4';
      return name.replace(/[<>:"/\\|?*]/g, '_').trim() || (type === 'image' ? 'x_image.jpg' : 'x_video.mp4');
    } catch { return type === 'image' ? 'x_image.jpg' : 'x_video.mp4'; }
  }

  // ================================================================
  // 触发下载（chrome.downloads.download + saveAs:true）
  // ================================================================
  async function downloadMedia(url, type) {
    if (!url) return false;
    const filename = getFilename(url, type);
    console.log('[XDL] download request:', { url: url.substring(0, 50), filename });

    try {
      const resp = await chrome.runtime.sendMessage({
        action: 'download',
        url,
        mediaType: type,
        filename: filename,
      });
      console.log('[XDL] download response:', resp);
      return resp && resp.success;
    } catch (err) {
      console.error('[XDL] sendMessage failed:', err);
      return false;
    }
  }

  // ================================================================
  // 拦截书签按钮 — 不阻止书签，额外触发下载
  // ================================================================
  function installBookmarkInterceptor() {
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-testid="bookmark"]');
      if (!btn) return;
      const tweet = btn.closest('article[data-testid="tweet"]');
      if (!tweet) return;

      // 直接执行下载（不使用 setTimeout，保证用户手势对 showSaveFilePicker 有效）
      const mediaList = getMediaList(tweet);
      if (mediaList.length === 0) return;

      showToast(`📥 正在下载 ${mediaList.length} 个文件...`);

      let success = 0;
      for (const item of mediaList) {
        const ok = await downloadMedia(item.url, item.type);
        if (ok) success++;
      }

      if (success > 0) {
        showToast(`✅ 已保存 ${success}/${mediaList.length} 个文件`);
      } else {
        showToast('⚠️ 保存失败');
      }
    }, true);
  }

  // ================================================================
  // 初始化
  // ================================================================
  function init() {
    injectCSS();
    installBookmarkInterceptor();
    console.log('[XDL] v9 ready ✅ — 点击书签 → 正常收藏 + 自动下载');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();