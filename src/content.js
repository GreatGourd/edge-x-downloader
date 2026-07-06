// X Media Downloader — Content Script (v10 ISOLATED world)
// 静默下载 + 自动关注未关注推主

(function () {
  'use strict';

  // ================================================================
  // 媒体缓存（来自 hook.js）
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
  // CSS (Toast only)
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

    tweetArticle.querySelectorAll('[data-testid="tweetPhoto"] img[src*="twimg.com"]').forEach(img => {
      list.push({ type: 'image', url: getBestImageUrl(img) });
    });

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
  // 文件名
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
  // 触发静默下载
  // ================================================================
  async function downloadMedia(url, type) {
    if (!url) return false;

    return new Promise((resolve) => {
      chrome.storage.local.get(['imagePath', 'videoPath', 'lastImageDir', 'lastVideoDir'], (data) => {
        const dir = type === 'image'
          ? (data.lastImageDir || data.imagePath || 'X/Images/')
          : (data.lastVideoDir || data.videoPath || 'X/Videos/');
        const fn = getFilename(url, type);
        const prefix = dir.endsWith('/') ? dir : dir + '/';

        chrome.runtime.sendMessage({
          action: 'download',
          url,
          mediaType: type,
          filename: prefix + fn,
          saveAs: false,
        }, (resp) => {
          resolve(resp && resp.success);
        });
      });
    });
  }

  // ================================================================
  // 自动关注
  // ================================================================
  function autoFollow(tweetArticle) {
    // 找关注按钮: X 的未关注按钮有 data-testid="follow" 或 data-testid="userFollow"
    const followBtn = tweetArticle.querySelector(
      '[data-testid="follow"], [data-testid="userFollow"], [data-testid="followButton"]'
    );
    if (!followBtn) return false;

    // 检查是否真的是"关注"按钮（不是"正在关注"或"已关注"）
    if (followBtn.getAttribute('aria-label')?.includes('取消') ||
        followBtn.getAttribute('data-testid') === 'unfollow') {
      return false;
    }

    // 只在按钮文字为"关注"时点击
    const text = followBtn.textContent?.trim() || '';
    if (text !== '关注' && text !== 'Follow') return false;

    followBtn.click();
    return true;
  }

  // ================================================================
  // 拦截书签按钮
  // ================================================================
  function installBookmarkInterceptor() {
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-testid="bookmark"]');
      if (!btn) return;
      const tweet = btn.closest('article[data-testid="tweet"]');
      if (!tweet) return;

      // 1. 自动关注
      const followed = autoFollow(tweet);

      // 2. 静默下载媒体
      const mediaList = getMediaList(tweet);
      if (mediaList.length > 0) {
        showToast(`📥 下载中 (${mediaList.length}个)`);
        let success = 0;
        for (const item of mediaList) {
          if (await downloadMedia(item.url, item.type)) success++;
        }
        if (followed) {
          showToast(`✅ 已关注 + 已保存 ${success} 个文件`);
        } else {
          showToast(`✅ 已保存 ${success} 个文件`);
        }
      } else if (followed) {
        showToast('✅ 已关注');
      }
    }, true);
  }

  // ================================================================
  // 初始化
  // ================================================================
  function init() {
    injectCSS();
    installBookmarkInterceptor();
    console.log('[XDL] v10 ready ✅ — 静默下载 + 自动关注');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();