// X Media Downloader — Options Page Logic

document.addEventListener('DOMContentLoaded', async () => {
  const imagePathInput = document.getElementById('imagePath');
  const videoPathInput = document.getElementById('videoPath');
  const lastImageDisplay = document.getElementById('lastImageDisplay');
  const lastVideoDisplay = document.getElementById('lastVideoDisplay');
  const saveBtn = document.getElementById('saveBtn');
  const resetBtn = document.getElementById('resetBtn');
  const saveMsg = document.getElementById('saveMsg');

  // 加载当前配置
  async function loadConfig() {
    try {
      const resp = await chrome.runtime.sendMessage({ action: 'getConfig' });
      if (!resp) return;
      imagePathInput.value = resp.imagePath || 'X/Images/';
      videoPathInput.value = resp.videoPath || 'X/Videos/';
      lastImageDisplay.textContent = resp.lastImageDir || '（暂无记录，下载后自动记忆）';
      lastVideoDisplay.textContent = resp.lastVideoDir || '（暂无记录，下载后自动记忆）';
    } catch (err) {
      console.error('加载配置失败:', err);
    }
  }

  // 显示保存反馈
  function showMessage(text, type) {
    saveMsg.textContent = text;
    saveMsg.className = 'save-msg show ' + (type || 'success');
    setTimeout(() => { saveMsg.className = 'save-msg'; }, 2500);
  }

  // 保存设置
  saveBtn.addEventListener('click', async () => {
    const imagePath = imagePathInput.value.trim() || 'X/Images/';
    const videoPath = videoPathInput.value.trim() || 'X/Videos/';

    // 确保以 / 结尾
    const fmtImg = imagePath.endsWith('/') ? imagePath : imagePath + '/';
    const fmtVid = videoPath.endsWith('/') ? videoPath : videoPath + '/';

    imagePathInput.value = fmtImg;
    videoPathInput.value = fmtVid;

    try {
      const resp = await chrome.runtime.sendMessage({
        action: 'saveConfig',
        imagePath: fmtImg,
        videoPath: fmtVid,
      });
      if (resp && resp.success) {
        showMessage('✅ 设置已保存');
      } else {
        showMessage('❌ 保存失败', 'error');
      }
    } catch (err) {
      showMessage('❌ 通信错误: ' + err.message, 'error');
    }
  });

  // 重置为默认
  resetBtn.addEventListener('click', async () => {
    imagePathInput.value = 'X/Images/';
    videoPathInput.value = 'X/Videos/';
    try {
      await chrome.runtime.sendMessage({
        action: 'saveConfig',
        imagePath: 'X/Images/',
        videoPath: 'X/Videos/',
      });
      showMessage('✅ 已重置为默认路径');
    } catch (err) {
      showMessage('❌ 重置失败: ' + err.message, 'error');
    }
  });

  // 回车保存
  imagePathInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveBtn.click(); });
  videoPathInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveBtn.click(); });

  // 初始化
  await loadConfig();
});