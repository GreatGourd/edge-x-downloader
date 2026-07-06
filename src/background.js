// X Media Downloader — Background Service Worker (v6)
// 静默下载，支持路径前缀

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'download') {
    const { url, mediaType, filename } = message;

    chrome.downloads.download(
      {
        url,
        filename: filename || 'download',
        saveAs: false,
        conflictAction: 'uniquify',
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          const err = chrome.runtime.lastError.message || 'unknown';
          console.error('[XDL] download error:', err, 'filename:', filename);
          sendResponse({ success: false, error: err });
          return;
        }
        if (downloadId !== undefined) {
          sendResponse({ success: true, downloadId });
        } else {
          sendResponse({ success: false, error: 'no id' });
        }
      }
    );
    return true;
  }

  if (message.action === 'getConfig') {
    chrome.storage.local.get(
      ['imagePath', 'videoPath', 'lastImageDir', 'lastVideoDir'],
      (data) => sendResponse(data)
    );
    return true;
  }

  if (message.action === 'saveConfig') {
    chrome.storage.local.set(
      { imagePath: message.imagePath, videoPath: message.videoPath },
      () => sendResponse({ success: true })
    );
    return true;
  }
});

// 下载完成后记忆路径
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state && delta.state.current === 'complete') {
    chrome.downloads.search({ id: delta.id }, (results) => {
      if (!results || results.length === 0) return;
      const finalPath = results[0].filename;
      const norm = finalPath.replace(/\\/g, '/');
      const idx = norm.toLowerCase().indexOf('/downloads/');
      if (idx >= 0) {
        const rel = norm.substring(idx + '/downloads/'.length);
        const lastSlash = rel.lastIndexOf('/');
        const dir = lastSlash >= 0 ? rel.substring(0, lastSlash + 1) : rel + '/';
        // 判断是图片还是视频（通过扩展名）
        const isVideo = /\.(mp4|webm|mov|avi)$/i.test(rel);
        const key = isVideo ? 'lastVideoDir' : 'lastImageDir';
        chrome.storage.local.set({ [key]: dir });
      }
    });
  }
});