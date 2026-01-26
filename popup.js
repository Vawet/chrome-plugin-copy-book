const taskList = document.getElementById('taskList');
const exportBtn = document.getElementById('exportMd');
const clearBtn = document.getElementById('clearAll');
const searchInput = document.getElementById('searchInput');

let allTasks = [];
let dragSrcEl = null;

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
            const textSpan = document.createElement('span');
            textSpan.className = 'task-text';
            textSpan.textContent = task.text;
            textSpan.ondblclick = () => enterEditMode(task.id, textSpan, item);

            main.appendChild(checkbox);
            main.appendChild(textSpan);
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
    const currentText = textSpan.textContent;
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