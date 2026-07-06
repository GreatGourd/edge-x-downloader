// X Media Downloader — Background Service Worker (v5)
// 简化：只负责接收下载请求，用 saveAs:true 弹出另存为

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'download') {
    const { url, mediaType, filename } = message;
    
    console.log('[XDL] bg received:', { 
      url: (url || '').substring(0, 50), 
      filename,
      mediaType,
    });

    if (!url) {
      sendResponse({ success: false, error: 'no url' });
      return;
    }

    chrome.downloads.download(
      {
        url,
        filename: filename || 'download',
        saveAs: true,
        conflictAction: 'uniquify',
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          const err = chrome.runtime.lastError.message || 'unknown';
          console.error('[XDL] bg error:', err);
          sendResponse({ success: false, error: err });
          return;
        }
        if (downloadId !== undefined) {
          console.log('[XDL] bg success, id:', downloadId);
          sendResponse({ success: true, downloadId });
        } else {
          sendResponse({ success: false, error: 'no id' });
        }
      }
    );
    return true; // keep channel open for async response
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