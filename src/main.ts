import { invoke } from "@tauri-apps/api/core";

interface TreeNode {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  has_children: boolean;
}

const btnSelectFolder = document.getElementById('btn-select-folder') as HTMLButtonElement;
const treeContainer = document.getElementById('tree-container') as HTMLDivElement;

const placeholder = document.getElementById('inspector-placeholder') as HTMLDivElement;
const details = document.getElementById('inspector-details') as HTMLDivElement;

const inspectName = document.getElementById('inspect-name') as HTMLHeadingElement;
const inspectPath = document.getElementById('inspect-path') as HTMLParagraphElement;
const inspectSize = document.getElementById('inspect-size') as HTMLDivElement;
const inspectType = document.getElementById('inspect-type') as HTMLDivElement;
const btnDelete = document.getElementById('btn-delete') as HTMLButtonElement;
const btnEmpty = document.getElementById('btn-empty') as HTMLButtonElement;

let currentSelectedPath: string | null = null;
let currentlySelectedRow: HTMLElement | null = null;

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

    if (nodeData.is_dir) {
        btnEmpty.classList.remove('hidden');
    } else {
        btnEmpty.classList.add('hidden');
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
            
            // Create root node representing selected folder
            const rootNode: TreeNode = {
                name: folder,
                path: folder,
                is_dir: true,
                size: 0, // Ignored at root display typically
                has_children: true,
            };
            
            fetchAndRenderChildren(folder, treeContainer);
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
            
            alert('Folder contents successfully deleted. Please refresh the parent folder.');
            
            inspectSize.textContent = '0 B';
        } catch (e) {
            alert(`Failed to empty folder: ${e}`);
        } finally {
            btnEmpty.disabled = false;
            btnEmpty.textContent = 'Empty Contents Only';
        }
    }
});
