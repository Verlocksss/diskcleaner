import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

interface TreeNode {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  has_children: boolean;
}

const btnSelectFolder = document.getElementById('btn-select-folder') as HTMLButtonElement;
const treeContainer = document.getElementById('tree-container') as HTMLDivElement;
const loadingOverlay = document.getElementById('loading-overlay') as HTMLDivElement;
const scanPathText = document.getElementById('scan-path-text') as HTMLSpanElement;

const placeholder = document.getElementById('inspector-placeholder') as HTMLDivElement;
const details = document.getElementById('inspector-details') as HTMLDivElement;

const inspectName = document.getElementById('inspect-name') as HTMLHeadingElement;
const inspectPath = document.getElementById('inspect-path') as HTMLParagraphElement;
const inspectSize = document.getElementById('inspect-size') as HTMLDivElement;
const inspectType = document.getElementById('inspect-type') as HTMLDivElement;
const btnDelete = document.getElementById('btn-delete') as HTMLButtonElement;
const btnEmpty = document.getElementById('btn-empty') as HTMLButtonElement;
const aiDesc = document.getElementById('ai-desc') as HTMLParagraphElement;
const btnAiAnalyze = document.getElementById('btn-ai-analyze') as HTMLButtonElement;
const aiResultBox = document.getElementById('ai-result-box') as HTMLDivElement;
const aiResultText = document.getElementById('ai-result-text') as HTMLParagraphElement;

let currentSelectedPath: string | null = null;
let currentlySelectedRow: HTMLElement | null = null;
let geminiStreamUnlisten: UnlistenFn | null = null;
let geminiDoneUnlisten: UnlistenFn | null = null;

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function selectNode(nodeData: TreeNode, rowEl: HTMLElement) {
    if (currentlySelectedRow) {
        currentlySelectedRow.classList.remove('selected');
    }
    currentlySelectedRow = rowEl;
    currentlySelectedRow.classList.add('selected');
    currentSelectedPath = nodeData.path;

    placeholder.classList.add('hidden');
    details.classList.remove('hidden');

    inspectName.textContent = nodeData.name;
    inspectPath.textContent = nodeData.path;
    inspectSize.textContent = formatBytes(nodeData.size);
    inspectType.textContent = nodeData.is_dir ? 'Directory' : 'File';

    aiResultBox.classList.add('hidden');
    aiResultText.textContent = '';

    if (nodeData.is_dir) {
        btnEmpty.classList.remove('hidden');
        aiDesc.textContent = "Ask Gemini to analyze this directory's safety in real-time.";
        btnAiAnalyze.textContent = "🪄 Analyze Folder with Gemini";
    } else {
        btnEmpty.classList.add('hidden');
        aiDesc.textContent = "Ask Gemini to analyze this file's safety in real-time.";
        btnAiAnalyze.textContent = "🪄 Analyze File with Gemini";
    }
}

async function fetchAndRenderChildren(path: string, container: HTMLElement) {
    container.innerHTML = '<div class="loading">Scanning contents...</div>';
    try {
        const children: TreeNode[] = await invoke("get_folder_children", { path });
        container.innerHTML = '';

        if (children.length === 0) {
            container.innerHTML = '<div class="tree-row"><div class="tree-name" style="color: grey; padding-left: 1.5rem">(Empty)</div></div>';
            return;
        }

        children.forEach(child => {
            const nodeEl = document.createElement('div');
            nodeEl.className = 'tree-node';

            const rowEl = document.createElement('div');
            rowEl.className = 'tree-row';
            
            const expandIcon = child.is_dir && child.has_children ? '▶' : (child.is_dir ? '📁' : '📄');
            
            rowEl.innerHTML = `
                <div class="tree-icon">${expandIcon}</div>
                <div class="tree-name">${child.name}</div>
                <div class="tree-size">${formatBytes(child.size)}</div>
            `;

            let childrenContainer: HTMLElement | null = null;
            let expanded = false;

            rowEl.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // Update Inspector
                selectNode(child, rowEl);

                // Handle Expansion if it's a directory
                if (child.is_dir && child.has_children) {
                    if (!childrenContainer) {
                        childrenContainer = document.createElement('div');
                        childrenContainer.className = 'tree-children';
                        nodeEl.appendChild(childrenContainer);
                        
                        rowEl.querySelector('.tree-icon')!.textContent = '▼';
                        expanded = true;
                        fetchAndRenderChildren(child.path, childrenContainer);
                    } else {
                        expanded = !expanded;
                        childrenContainer.style.display = expanded ? 'flex' : 'none';
                        rowEl.querySelector('.tree-icon')!.textContent = expanded ? '▼' : '▶';
                    }
                }
            });

            nodeEl.appendChild(rowEl);
            container.appendChild(nodeEl);
        });
    } catch (e) {
        container.innerHTML = `<div class="loading">Error reading directory</div>`;
    }
}

btnSelectFolder.addEventListener('click', async () => {
    btnSelectFolder.disabled = true;
    try {
        const folder: string | null = await invoke("open_folder_picker");
        if (folder) {
            treeContainer.innerHTML = '';
            loadingOverlay.classList.remove('hidden');
            scanPathText.textContent = folder;
            
            try {
                // Execute deep scan globally
                await invoke("scan_directory", { rootPath: folder });
                
                // Fetch and render the actual children
                fetchAndRenderChildren(folder, treeContainer);
            } catch (e) {
                alert(`Scan failed: ${e}`);
            } finally {
                loadingOverlay.classList.add('hidden');
            }
        }
    } finally {
        btnSelectFolder.disabled = false;
    }
});

btnDelete.addEventListener('click', async () => {
    if (!currentSelectedPath) return;

    if (confirm(`Are you absolutely sure you want to permanently delete:\n\n${currentSelectedPath}`)) {
        btnDelete.disabled = true;
        btnDelete.textContent = 'Deleting...';
        
        try {
            await invoke("clean_paths", { pathsToClean: [currentSelectedPath] });
            
            alert('Item successfully deleted. Please refresh the parent folder.');
            
            details.classList.add('hidden');
            placeholder.classList.remove('hidden');
            
            if (currentlySelectedRow) {
                currentlySelectedRow.parentElement?.remove();
            }
            currentSelectedPath = null;
        } catch (e) {
            alert(`Failed to delete: ${e}`);
        } finally {
            btnDelete.disabled = false;
            btnDelete.textContent = 'Permanently Delete';
        }
    }
});

btnEmpty.addEventListener('click', async () => {
    if (!currentSelectedPath) return;

    if (confirm(`Are you absolutely sure you want to empty the contents of:\n\n${currentSelectedPath} ?\n\nThe folder itself will remain.`)) {
        btnEmpty.disabled = true;
        btnEmpty.textContent = 'Emptying...';
        
        try {
            await invoke("empty_dir_contents", { pathStr: currentSelectedPath });
            
            alert('Folder contents successfully deleted.');
            
            inspectSize.textContent = '0 B';
            
            // Destroy cached DOM children so next expansion fetches accurate backend data
            if (currentlySelectedRow) {
                const sizeEl = currentlySelectedRow.querySelector('.tree-size');
                if (sizeEl) {
                    sizeEl.textContent = '0 B';
                }
                const nodeEl = currentlySelectedRow.parentElement;
                if (nodeEl) {
                    const childrenContainer = nodeEl.querySelector('.tree-children');
                    if (childrenContainer) {
                        childrenContainer.remove();
                    }
                    const icon = currentlySelectedRow.querySelector('.tree-icon');
                    if (icon && icon.textContent === '▼') {
                        icon.textContent = '▶';
                    }
                }
            }
            
        } catch (e) {
            alert(`Failed to empty folder: ${e}`);
        } finally {
            btnEmpty.disabled = false;
            btnEmpty.textContent = 'Empty Contents Only';
        }
    }
});

btnAiAnalyze.addEventListener('click', async () => {
    if (!currentSelectedPath) return;

    btnAiAnalyze.disabled = true;
    btnAiAnalyze.textContent = 'Thinking...';
    aiResultBox.classList.remove('hidden');
    aiResultText.textContent = '';
    
    if (geminiStreamUnlisten) geminiStreamUnlisten();
    if (geminiDoneUnlisten) geminiDoneUnlisten();

    geminiStreamUnlisten = await listen<string>('gemini-stream', (event) => {
        aiResultText.textContent += event.payload + '\n';
        aiResultBox.scrollTop = aiResultBox.scrollHeight;
    });

    geminiDoneUnlisten = await listen<boolean>('gemini-done', () => {
        btnAiAnalyze.disabled = false;
        btnAiAnalyze.textContent = currentlySelectedRow?.querySelector('.tree-icon')?.textContent === '📄' ? '🪄 Analyze File with Gemini' : '🪄 Analyze Folder with Gemini';
    });
    
    try {
        await invoke("analyze_directory_ai", { path: currentSelectedPath });
    } catch (e) {
        aiResultText.textContent += `Error: ${e}`;
        btnAiAnalyze.disabled = false;
        btnAiAnalyze.textContent = currentlySelectedRow?.querySelector('.tree-icon')?.textContent === '📄' ? '🪄 Analyze File with Gemini' : '🪄 Analyze Folder with Gemini';
    }
});
