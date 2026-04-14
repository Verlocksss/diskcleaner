import { invoke } from "@tauri-apps/api/core";

const btnScan = document.getElementById('btn-scan') as HTMLButtonElement | null;
const btnClean = document.getElementById('btn-clean') as HTMLButtonElement | null;
const statusIcon = document.getElementById('status-icon');
const statusMessage = document.getElementById('status-message');
const sizeDisplay = document.getElementById('size-display');

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

if (btnScan && btnClean && statusIcon && statusMessage && sizeDisplay) {
  btnScan.addEventListener('click', async () => {
    btnScan.disabled = true;
    btnClean.classList.add('hidden');
    sizeDisplay.classList.add('hidden');
    
    statusIcon.textContent = '⏳';
    statusIcon.classList.add('spinning');
    statusMessage.textContent = 'Scanning system temporary files...';
    
    try {
      // Invoke Rust Backend Command
      const size: number = await invoke("scan_temp_dir");
      
      statusIcon.classList.remove('spinning');
      
      if (size > 0) {
        statusIcon.textContent = '⚠️';
        statusMessage.textContent = 'Junk files found:';
        sizeDisplay.textContent = formatBytes(size);
        sizeDisplay.classList.remove('hidden');
        
        btnClean.classList.remove('hidden');
        btnScan.textContent = 'Rescan';
      } else {
        statusIcon.textContent = '✅';
        statusMessage.textContent = 'Your system is clean!';
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
    btnScan.disabled = true;
    btnClean.disabled = true;
    
    statusIcon.textContent = '🧹';
    statusIcon.classList.add('spinning');
    statusMessage.textContent = 'Cleaning temporary files...';
    sizeDisplay.classList.add('hidden');
    
    try {
      // Invoke Rust Backend Command
      await invoke("clean_temp_dir");
      
      statusIcon.classList.remove('spinning');
      statusIcon.textContent = '✨';
      statusMessage.textContent = 'Cleaning complete! Space freed.';
      
      btnClean.classList.add('hidden');
    } catch (error) {
      statusIcon.classList.remove('spinning');
      statusIcon.textContent = '❌';
      statusMessage.textContent = `Error during cleanup: ${error}`;
    } finally {
      btnScan.disabled = false;
      btnClean.disabled = false;
      btnScan.textContent = 'Rescan';
    }
  });
}
