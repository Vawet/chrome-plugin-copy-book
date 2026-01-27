const taskList = document.getElementById('taskList');
const exportBtn = document.getElementById('exportMd');
const clearBtn = document.getElementById('clearAll');
const searchInput = document.getElementById('searchInput');

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

exportBtn.onclick = () => {
    chrome.storage.local.get({ tasks: [] }, (result) => {
        const content = result.tasks
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

clearBtn.onclick = () => {
    if (confirm('确定清空所有记录吗？')) {
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
