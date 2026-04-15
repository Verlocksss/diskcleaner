import { invoke } from "@tauri-apps/api/core";

export interface ScanCategory {
  id: string;
  name: string;
  description: string;
  paths: string[];
  size: number;
  file_count: number;
}

export interface ScanResult {
  categories: ScanCategory[];
  total_size: number;
}

const btnScan = document.getElementById('btn-scan') as HTMLButtonElement;
const btnClean = document.getElementById('btn-clean') as HTMLButtonElement;
const statusIcon = document.getElementById('status-icon') as HTMLDivElement;
const statusMessage = document.getElementById('status-message') as HTMLParagraphElement;
const sizeDisplay = document.getElementById('size-display') as HTMLParagraphElement;
const categoryList = document.getElementById('category-list') as HTMLDivElement;

let currentScanResult: ScanResult | null = null;
let selectedPaths = new Set<string>();

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function updateCleanButtonState() {
  if (selectedPaths.size > 0) {
    btnClean.disabled = false;
    btnClean.textContent = `Clean Selected (${selectedPaths.size} locations)`;
  } else {
    btnClean.disabled = true;
    btnClean.textContent = 'Clean Selected (0)';
  }
}

function renderCategories(result: ScanResult) {
  categoryList.innerHTML = '';
  categoryList.classList.remove('hidden');
  selectedPaths.clear();

  result.categories.forEach(cat => {
    // If it has sizes, auto-select it by default to make it easy for users.
    const hasJunk = cat.size > 0;
    
    if (hasJunk) {
      cat.paths.forEach(p => selectedPaths.add(p));
    }

    const item = document.createElement('div');
    item.className = `category-item ${hasJunk ? '' : 'disabled'}`;
    
    // Toggle clicking on the item container checking the box
    item.addEventListener('click', (e) => {
        if (!hasJunk || (e.target as HTMLElement).tagName === 'INPUT') return;
        const cb = item.querySelector('input') as HTMLInputElement;
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change'));
    });

    item.innerHTML = `
      <div class="cat-checkbox">
        <input type="checkbox" id="cat_${cat.id}" ${hasJunk ? 'checked' : ''} ${hasJunk ? '' : 'disabled'} />
      </div>
      <div class="cat-info">
        <div class="cat-header">
          <span class="cat-title">${cat.name}</span>
          <span class="cat-stats">${formatBytes(cat.size)} (${cat.file_count} files)</span>
        </div>
        <p class="cat-desc">${cat.description}</p>
      </div>
    `;

    const checkbox = item.querySelector('input') as HTMLInputElement;
    checkbox.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      cat.paths.forEach(p => {
        if (checked) selectedPaths.add(p);
        else selectedPaths.delete(p);
      });
      updateCleanButtonState();
    });

    categoryList.appendChild(item);
  });
  
  updateCleanButtonState();
}

btnScan.addEventListener('click', async () => {
  btnScan.disabled = true;
  btnClean.classList.add('hidden');
  sizeDisplay.classList.add('hidden');
  categoryList.classList.add('hidden');
  
  statusIcon.textContent = '⏳';
  statusIcon.classList.add('spinning');
  statusMessage.textContent = 'Scanning system components...';
  
  try {
    const result: ScanResult = await invoke("scan_system");
    currentScanResult = result;
    
    statusIcon.classList.remove('spinning');
    
    if (result.total_size > 0) {
      statusIcon.textContent = '⚠️';
      statusMessage.textContent = 'Review found items and select what to clean:';
      sizeDisplay.textContent = formatBytes(result.total_size);
      sizeDisplay.classList.remove('hidden');
      
      renderCategories(result);
      btnClean.classList.remove('hidden');
      btnScan.textContent = 'Rescan System';
    } else {
      statusIcon.textContent = '✅';
      statusMessage.textContent = 'Your system is completely clean!';
      btnScan.textContent = 'Scan Again';
    }
  } catch (error) {
    statusIcon.classList.remove('spinning');
    statusIcon.textContent = '❌';
    statusMessage.textContent = `Error: ${error}`;
  } finally {
    btnScan.disabled = false;
  }
});

btnClean.addEventListener('click', async () => {
  if (selectedPaths.size === 0) return;

  btnScan.disabled = true;
  btnClean.disabled = true;
  categoryList.classList.add('hidden');
  
  statusIcon.textContent = '🧹';
  statusIcon.classList.add('spinning');
  statusMessage.textContent = 'Securely wiping selected locations...';
  sizeDisplay.classList.add('hidden');
  
  try {
    const pathsArray = Array.from(selectedPaths);
    await invoke("clean_paths", { pathsToClean: pathsArray });
    
    statusIcon.classList.remove('spinning');
    statusIcon.textContent = '✨';
    statusMessage.textContent = 'Selected cleanup complete!';
    
    btnClean.classList.add('hidden');
    selectedPaths.clear();
  } catch (error) {
    statusIcon.classList.remove('spinning');
    statusIcon.textContent = '❌';
    statusMessage.textContent = `Error during cleanup: ${error}`;
  } finally {
    btnScan.disabled = false;
    btnClean.disabled = false;
    btnScan.textContent = 'Verify / Rescan';
  }
});
