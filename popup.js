const taskList = document.getElementById('taskList');
const exportBtn = document.getElementById('exportMd');
const collectBtn = document.getElementById('collectChecked');
const viewStashedBtn = document.getElementById('viewStashed');
const exportAiBtn = document.getElementById('exportAiMd');
const clearBtn = document.getElementById('clearAll');
const searchInput = document.getElementById('searchInput');

const stashedModal = document.getElementById('stashedModal');
const stashedList = document.getElementById('stashedList');
const closeStashed = document.getElementById('closeStashed');
const closeStashedBtn = document.getElementById('closeStashedBtn');
const clearStashedBtn = document.getElementById('clearStashed');

const settingsModal = document.getElementById('settingsModal');
const openSettingsBtn = document.getElementById('openSettings');
const closeSettingsBtn = document.getElementById('closeSettings');
const saveSettingsBtn = document.getElementById('saveSettings');
const apiKeyInput = document.getElementById('apiKeyInput');
const apiBaseInput = document.getElementById('apiBaseInput');
const loadingOverlay = document.getElementById('loadingOverlay');

let allTasks = [];
let dragSrcEl = null;

function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '-9999px';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            const ok = document.execCommand('copy');
            document.body.removeChild(textarea);
            if (ok) resolve();
            else reject(new Error('copy failed'));
        } catch (err) {
            document.body.removeChild(textarea);
            reject(err);
        }
    });
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizeUrl(url) {
    const trimmed = url.trim();
    if (!trimmed) return '';
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('mailto:')) {
        return trimmed;
    }
    return '';
}

function parseInline(text) {
    if (!text) return '';
    const codeTokens = [];
    let output = escapeHtml(text).replace(/`([^`\n]+)`/g, (match, code) => {
        const key = `__CODE_${codeTokens.length}__`;
        codeTokens.push(`<code>${code}</code>`);
        return key;
    });

    output = output.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
        const safeUrl = sanitizeUrl(url);
        if (!safeUrl) return alt;
        return `<img alt="${alt}" src="${safeUrl}">`;
    });

    output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
        const safeUrl = sanitizeUrl(url);
        if (!safeUrl) return label;
        return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });

    output = output.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
    output = output.replace(/__([\s\S]+?)__/g, '<strong>$1</strong>');
    output = output.replace(/~~([\s\S]+?)~~/g, '<del>$1</del>');
    output = output.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    output = output.replace(/_([^_\n]+)_/g, '<em>$1</em>');

    codeTokens.forEach((token, index) => {
        output = output.replace(`__CODE_${index}__`, token);
    });

    return output;
}

function renderMarkdown(text) {
    if (!text) return '';
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const result = [];
    let inCode = false;
    let codeLines = [];
    let inUl = false;
    let inOl = false;
    let paragraph = [];

    const closeLists = () => {
        if (inUl) {
            result.push('</ul>');
            inUl = false;
        }
        if (inOl) {
            result.push('</ol>');
            inOl = false;
        }
    };

    const flushParagraph = () => {
        if (paragraph.length) {
            result.push(`<p>${paragraph.join('<br>')}</p>`);
            paragraph = [];
        }
    };

    lines.forEach((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('```')) {
            if (inCode) {
                result.push(`<pre><code>${codeLines.map(escapeHtml).join('\n')}</code></pre>`);
                inCode = false;
                codeLines = [];
            } else {
                flushParagraph();
                closeLists();
                inCode = true;
            }
            return;
        }

        if (inCode) {
            codeLines.push(line);
            return;
        }

        if (!trimmed) {
            flushParagraph();
            closeLists();
            return;
        }

        const headingMatch = trimmed.match(/^(.*?)(#{1,6})\s+(.*)$/);
        if (headingMatch) {
            const preText = headingMatch[1].trim();
            const level = headingMatch[2].length;
            const titleText = headingMatch[3];

            if (preText) {
                paragraph.push(parseInline(preText));
                flushParagraph();
            }

            closeLists();
            result.push(`<h${level}>${parseInline(titleText)}</h${level}>`);
            return;
        }

        if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
            flushParagraph();
            closeLists();
            result.push('<hr>');
            return;
        }

        const quoteMatch = trimmed.match(/^>\s+(.*)$/);
        if (quoteMatch) {
            flushParagraph();
            closeLists();
            result.push(`<blockquote>${parseInline(quoteMatch[1])}</blockquote>`);
            return;
        }

        const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
        if (orderedMatch) {
            flushParagraph();
            if (!inOl) {
                closeLists();
                result.push('<ol>');
                inOl = true;
            }
            result.push(`<li>${parseInline(orderedMatch[2])}</li>`);
            return;
        }

        const unorderedMatch = trimmed.match(/^[-+*]\s+(.*)$/);
        if (unorderedMatch) {
            flushParagraph();
            if (!inUl) {
                closeLists();
                result.push('<ul>');
                inUl = true;
            }
            result.push(`<li>${parseInline(unorderedMatch[1])}</li>`);
            return;
        }

        closeLists();
        paragraph.push(parseInline(trimmed));
    });

    if (inCode) {
        result.push(`<pre><code>${codeLines.map(escapeHtml).join('\n')}</code></pre>`);
    }

    flushParagraph();
    closeLists();
    return result.join('');
}

/**
 * @param {Array} tasks
 */
function renderTasks(tasks) {
    const searchTerm = searchInput.value.toLowerCase();
    const filteredTasks = tasks.filter(t =>
        t.text.toLowerCase().includes(searchTerm) ||
        (t.sourceTitle && t.sourceTitle.toLowerCase().includes(searchTerm))
    );

    // 3. 按日期分组逻辑
    const groups = filteredTasks.reduce((acc, task) => {
        const date = task.timestamp ? task.timestamp.split(' ')[0] : '未知日期';
        if (!acc[date]) acc[date] = [];
        acc[date].push(task);
        return acc;
    }, {});

    taskList.innerHTML = '';

    Object.keys(groups).forEach(date => {
        // 添加日期标题
        const title = document.createElement('div');
        title.className = 'date-group-title';
        title.textContent = date;
        taskList.appendChild(title);

        groups[date].forEach((task) => {
            const item = document.createElement('div');
            item.className = `task-item ${task.completed ? 'completed' : ''}`;
            item.draggable = true;
            item.dataset.id = task.id;

            // Drag events
            item.addEventListener('dragstart', handleDragStart);
            item.addEventListener('dragover', handleDragOver);
            item.addEventListener('drop', handleDrop);
            item.addEventListener('dragend', handleDragEnd);

            const deleteBtn = document.createElement('div');
            deleteBtn.className = 'delete-btn';
            deleteBtn.innerHTML = '&times;';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                deleteTask(task.id);
            };

            const main = document.createElement('div');
            main.className = 'task-main';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = task.completed;
            checkbox.onchange = () => toggleTask(task.id);

            // 2. 双击编辑逻辑
            const textSpan = document.createElement('div');
            textSpan.className = 'task-text';
            textSpan.dataset.raw = task.text;
            textSpan.innerHTML = renderMarkdown(task.text);
            textSpan.ondblclick = () => enterEditMode(task.id, textSpan, item);

            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'copy-btn';
            copyBtn.textContent = 'Copy';
            copyBtn.onmousedown = (e) => e.stopPropagation();
            copyBtn.onclick = (e) => {
                e.stopPropagation();
                copyTextToClipboard(task.text);
            };

            main.appendChild(checkbox);
            main.appendChild(textSpan);
            main.appendChild(copyBtn);
            item.appendChild(deleteBtn);
            item.appendChild(main);

            const info = document.createElement('div');
            info.className = 'task-info';

            const sourceSpan = document.createElement('span');
            sourceSpan.className = 'task-source';
            if (task.sourceTitle) {
                sourceSpan.innerHTML = `来自: <a href="${task.sourceUrl}" target="_blank">${task.sourceTitle}</a>`;
            } else {
                sourceSpan.textContent = '本地复制';
            }

            const timeSpan = document.createElement('span');
            timeSpan.className = 'task-time';
            timeSpan.textContent = task.timestamp ? task.timestamp.split(' ')[1] : '';

            info.appendChild(sourceSpan);
            info.appendChild(timeSpan);
            item.appendChild(info);

            taskList.appendChild(item);
        });
    });
}

/**
 * 进入编辑模式
 */
function enterEditMode(id, textSpan, item) {
    const currentText = textSpan.dataset.raw || textSpan.textContent;
    const input = document.createElement('textarea');
    input.className = 'edit-input';
    input.value = currentText;

    // 自动调整高度以适应内容
    input.style.height = 'auto';
    input.style.height = (textSpan.scrollHeight + 20) + 'px';

    // 替换 span 为 input
    textSpan.replaceWith(input);
    input.focus();
    item.draggable = false; // 编辑时禁用拖拽

    const saveEdit = () => {
        const newText = input.value.trim();
        if (newText && newText !== currentText) {
            updateTaskText(id, newText);
        } else {
            input.replaceWith(textSpan);
            item.draggable = true;
        }
    };

    input.onblur = saveEdit;
    input.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            input.blur();
        }
        if (e.key === 'Escape') {
            input.value = currentText;
            input.blur();
        }
    };
}

function updateTaskText(id, newText) {
    chrome.storage.local.get({ tasks: [] }, (result) => {
        const tasks = result.tasks.map(t =>
            t.id === id ? { ...t, text: newText } : t
        );
        chrome.storage.local.set({ tasks });
    });
}

// Drag & Drop Handlers (保持原有逻辑，但需要适配分组后的 index)
function handleDragStart(e) {
    this.classList.add('dragging');
    dragSrcEl = this;
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    return false;
}

function handleDrop(e) {
    e.stopPropagation();
    e.preventDefault();

    if (dragSrcEl !== this) {
        const fromId = parseInt(dragSrcEl.dataset.id);
        const toId = parseInt(this.dataset.id);

        const fromIndex = allTasks.findIndex(t => t.id === fromId);
        const toIndex = allTasks.findIndex(t => t.id === toId);

        const updatedTasks = [...allTasks];
        const [movedItem] = updatedTasks.splice(fromIndex, 1);
        updatedTasks.splice(toIndex, 0, movedItem);

        chrome.storage.local.set({ tasks: updatedTasks });
    }
    return false;
}

function handleDragEnd() {
    this.classList.remove('dragging');
}

function toggleTask(id) {
    chrome.storage.local.get({ tasks: [] }, (result) => {
        const tasks = result.tasks.map(t =>
            t.id === id ? { ...t, completed: !t.completed } : t
        );
        chrome.storage.local.set({ tasks });
    });
}

function deleteTask(id) {
    chrome.storage.local.get({ tasks: [] }, (result) => {
        const tasks = result.tasks.filter(t => t.id !== id);
        chrome.storage.local.set({ tasks });
    });
}

searchInput.oninput = () => renderTasks(allTasks);

// --- AI 设置逻辑 ---
openSettingsBtn.onclick = () => {
    chrome.storage.local.get(['aiApiKey', 'apiBaseUrl'], (result) => {
        apiKeyInput.value = result.aiApiKey || '';
        apiBaseInput.value = result.apiBaseUrl || 'https://api.deepseek.com/v1';
        settingsModal.style.display = 'flex';
    });
};

closeSettingsBtn.onclick = () => settingsModal.style.display = 'none';

saveSettingsBtn.onclick = () => {
    const apiKey = apiKeyInput.value.trim();
    const apiBase = apiBaseInput.value.trim() || 'https://api.deepseek.com/v1';
    
    chrome.storage.local.set({ 
        aiApiKey: apiKey, 
        apiBaseUrl: apiBase 
    }, () => {
        showCustomAlert('设置已保存');
        settingsModal.style.display = 'none';
    });
};

async function callDeepSeek(text) {
    const result = await new Promise(r => chrome.storage.local.get(['aiApiKey', 'apiBaseUrl'], r));
    if (!result.aiApiKey) {
        throw new Error('请先在设置中配置 API Key');
    }

    const prompt = `你需要对我传入的Markdown格式文本进行优化处理，核心要求如下：
 
1. 完全保留文本中的所有核心信息、关键数据、原始意图，不增删、不修改原意；

2. 精准剔除文本中的口语化语气词、赘余助词（如呢、啊、吧、啦、其实、就是说、呃等），简化口语化表述，使语句更简洁正式；

3. 梳理内容逻辑，对零散表述做自然衔接，保持原有列表/段落结构不变，Markdown格式规范统一；

4. 仅做表述优化与格式规整，不额外归纳总结、不调整内容顺序、不添加任何无关内容；

5. 输出结果仍为标准Markdown格式，与输入的基础结构（标题、列表、换行等）保持一致`;

    const response = await fetch(`${result.apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${result.aiApiKey}`
        },
        body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
                { role: "system", content: prompt },
                { role: "user", content: text }
            ],
            temperature: 0.3
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'AI 请求失败');
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

exportAiBtn.onclick = () => {
    chrome.storage.local.get({ tasks: [], stashedTasks: [] }, async (result) => {
        const allToExport = [...result.tasks];
        const taskIds = new Set(allToExport.map(t => t.id));
        result.stashedTasks.forEach(stashed => {
            if (!taskIds.has(stashed.id)) allToExport.push(stashed);
        });

        if (allToExport.length === 0) {
            showCustomAlert('当前没有任何可导出的内容');
            return;
        }

        allToExport.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const rawContent = allToExport
            .map(t => `- [${t.completed ? 'x' : ' '}] ${t.text}`)
            .join('\n');

        loadingOverlay.style.display = 'flex';
        try {
            const optimizedContent = await callDeepSeek(rawContent);
            const blob = new Blob([optimizedContent], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'optimized-todo-list.md';
            a.click();
        } catch (err) {
            showCustomAlert(`优化失败: ${err.message}`);
        } finally {
            loadingOverlay.style.display = 'none';
        }
    });
};

exportBtn.onclick = () => {
    chrome.storage.local.get({ tasks: [], stashedTasks: [] }, (result) => {
        // 合并当前任务和暂存任务，通过 ID 去重
        const allToExport = [...result.tasks];
        const taskIds = new Set(allToExport.map(t => t.id));
        
        result.stashedTasks.forEach(stashed => {
            if (!taskIds.has(stashed.id)) {
                allToExport.push(stashed);
            }
        });

        // 按时间戳排序（可选，保持文档整洁）
        allToExport.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const content = allToExport
            .map(t => `- [${t.completed ? 'x' : ' '}] ${t.text} (来源: [${t.sourceTitle}](${t.sourceUrl}) | 时间: ${t.timestamp})`)
            .join('\n');
        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'todo-list.md';
        a.click();
    });
};

// --- 自定义弹窗逻辑 ---
function showCustomAlert(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('customModal');
        const msgEl = document.getElementById('modalMessage');
        const confirmBtn = document.getElementById('modalConfirm');
        const cancelBtn = document.getElementById('modalCancel');

        msgEl.textContent = message;
        cancelBtn.style.display = 'none';
        modal.style.display = 'flex';

        confirmBtn.onclick = () => {
            modal.style.display = 'none';
            resolve();
        };
    });
}

function showCustomConfirm(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('customModal');
        const msgEl = document.getElementById('modalMessage');
        const confirmBtn = document.getElementById('modalConfirm');
        const cancelBtn = document.getElementById('modalCancel');

        msgEl.textContent = message;
        cancelBtn.style.display = 'block';
        modal.style.display = 'flex';

        confirmBtn.onclick = () => {
            modal.style.display = 'none';
            resolve(true);
        };
        cancelBtn.onclick = () => {
            modal.style.display = 'none';
            resolve(false);
        };
    });
}

// 暴露给其他脚本
window.showCustomConfirm = showCustomConfirm;
window.showCustomAlert = showCustomAlert;

function renderStashedTasks() {
    chrome.storage.local.get({ stashedTasks: [] }, (result) => {
        stashedList.innerHTML = '';
        if (result.stashedTasks.length === 0) {
            stashedList.innerHTML = '<div style="text-align: center; color: var(--text-light); padding: 20px;">暂无内容</div>';
            return;
        }

        result.stashedTasks.forEach(task => {
            const item = document.createElement('div');
            item.className = 'stashed-item';
            
            const text = document.createElement('div');
            text.className = 'stashed-item-text';
            text.textContent = task.text;

            const info = document.createElement('div');
            info.className = 'stashed-item-info';
            info.textContent = `时间: ${task.timestamp}`;

            const del = document.createElement('div');
            del.className = 'stashed-item-del';
            del.innerHTML = '&times;';
            del.onclick = () => deleteStashedTask(task.id);

            item.appendChild(text);
            item.appendChild(info);
            item.appendChild(del);
            stashedList.appendChild(item);
        });
    });
}

async function deleteStashedTask(id) {
    if (await showCustomConfirm('确定删除该暂存项吗？')) {
        chrome.storage.local.get({ stashedTasks: [] }, (result) => {
            const newStashed = result.stashedTasks.filter(t => t.id !== id);
            chrome.storage.local.set({ stashedTasks: newStashed }, () => {
                renderStashedTasks();
            });
        });
    }
}

viewStashedBtn.onclick = () => {
    renderStashedTasks();
    stashedModal.style.display = 'flex';
};

closeStashed.onclick = closeStashedBtn.onclick = () => {
    stashedModal.style.display = 'none';
};

clearStashedBtn.onclick = async () => {
    if (await showCustomConfirm('确定清空所有暂存项吗？')) {
        chrome.storage.local.set({ stashedTasks: [] }, () => {
            renderStashedTasks();
        });
    }
};

collectBtn.onclick = () => {
    const checkedTasks = allTasks.filter(t => t.completed);
    if (checkedTasks.length === 0) {
        showCustomAlert('当前没有已勾选的项');
        return;
    }

    chrome.storage.local.get({ tasks: [], stashedTasks: [] }, (result) => {
        const currentStashed = result.stashedTasks;
        const stashedIds = new Set(currentStashed.map(t => t.id));
        
        const newStashed = [...currentStashed];
        const checkedIds = new Set();

        checkedTasks.forEach(task => {
            checkedIds.add(task.id);
            if (!stashedIds.has(task.id)) {
                newStashed.push(task);
            }
        });

        // 从当前任务中移除已收集的项
        const remainingTasks = result.tasks.filter(t => !checkedIds.has(t.id));

        chrome.storage.local.set({ 
            stashedTasks: newStashed,
            tasks: remainingTasks 
        }, () => {
            showCustomAlert(`已成功收集 ${checkedTasks.length} 个勾选项并移至暂存区`);
        });
    });
};

clearBtn.onclick = async () => {
    if (await showCustomConfirm('确定清空所有记录吗？')) {
        chrome.storage.local.set({ tasks: [] });
    }
};

chrome.storage.onChanged.addListener((changes) => {
    if (changes.tasks) {
        allTasks = changes.tasks.newValue || [];
        renderTasks(allTasks);
    }
});

chrome.storage.local.get({ tasks: [] }, (result) => {
    allTasks = result.tasks;
    renderTasks(allTasks);
});

// --- 图片上传与 Stack 初始化 ---
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

async function loadImages() {
    try {
        const images = await getAllImages();
        if (typeof window.renderStack === 'function') {
            window.renderStack(images, async (id) => {
                await deleteImage(id);
                loadImages();
            });
        }
    } catch (err) {
        console.error('加载图片失败:', err);
    }
}

// 延迟一下确保脚本加载完成
setTimeout(loadImages, 200);

async function handleUpload(files) {
    for (const file of files) {
        if (file.type.startsWith('image/')) {
            const compressed = await compressImage(file);
            await saveImage(compressed);
        }
    }
    loadImages();
}

if (dropZone) {
    dropZone.onclick = () => fileInput.click();
    fileInput.onchange = (e) => handleUpload(e.target.files);

    dropZone.ondragover = (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    };
    dropZone.ondragleave = () => dropZone.classList.remove('dragover');
    dropZone.ondrop = (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        handleUpload(e.dataTransfer.files);
    };
}

document.addEventListener('paste', (e) => {
    const items = e.clipboardData.items;
    const files = [];
    for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
            files.push(item.getAsFile());
        }
    }
    if (files.length > 0) {
        handleUpload(files);
    }
});
