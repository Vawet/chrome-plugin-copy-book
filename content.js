document.addEventListener('copy', () => {
    const selectedText = window.getSelection().toString().trim();
    if (selectedText) {
        if (!chrome.runtime?.id) {
            console.warn('插件上下文已失效，请刷新页面');
            return;
        }
        chrome.storage.local.get({ tasks: [] }, (result) => {
            const tasks = result.tasks;
            const newTask = {
                id: Date.now(),
                text: selectedText,
                completed: false,
                timestamp: new Date().toLocaleString(),
                sourceTitle: document.title,
                sourceUrl: window.location.href
            };
            tasks.unshift(newTask);
            chrome.storage.local.set({ tasks }, () => {
                showToast('已记录到待办清单');
            });
        });
    }
});

/**
 * @param {string} message
 */
function showToast(message) {
    // 1. 创建宿主元素 (Host)
    const host = document.createElement('div');
    host.id = 'copy-todo-toast-host';
    // 确保宿主元素本身不干扰页面布局
    host.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 999999; pointer-events: none;';
    document.body.appendChild(host);

    // 2. 附加 Shadow Root
    const shadow = host.attachShadow({ mode: 'open' });

    // 3. 在 Shadow DOM 内部创建样式和结构
    const container = document.createElement('div');
    container.className = 'toast-container';
    container.textContent = message;

    const style = document.createElement('style');
    style.textContent = `
    .toast-container {
      background: #2563eb;
      color: white;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 14px;
      font-family: sans-serif;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transition: opacity 0.3s, transform 0.3s;
      transform: translateY(20px);
      opacity: 0;
    }
    .show {
      opacity: 1;
      transform: translateY(0);
    }
  `;

    shadow.appendChild(style);
    shadow.appendChild(container);

    // 4. 触发动画
    setTimeout(() => {
        container.classList.add('show');
    }, 10);

    // 5. 3秒后移除整个宿主元素
    setTimeout(() => {
        container.classList.remove('show');
        setTimeout(() => host.remove(), 300);
    }, 3000);
}