use std::env;
use std::fs;
use std::path::Path;

fn get_dir_size(path: &Path) -> u64 {
    let mut size = 0;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Ok(metadata) = entry.metadata() {
                    size += metadata.len();
                }
            } else if path.is_dir() {
                size += get_dir_size(&path);
            }
        }
    }
    size
}

#[tauri::command]
fn scan_temp_dir() -> u64 {
    let temp_dir = env::temp_dir();
    get_dir_size(&temp_dir)
}

#[tauri::command]
fn clean_temp_dir() -> Result<(), String> {
    let temp_dir = env::temp_dir();
    
    // We iterate through the top level entries of the temp directory.
    // If it's a directory, we use remove_dir_all, if it's a file we remove it.
    // We intentionally ignore errors (like Access Denied) because some temp files 
    // are actively in use by Windows or other running programs.
    if let Ok(entries) = fs::read_dir(temp_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let _ = fs::remove_dir_all(&path);
            } else {
                let _ = fs::remove_file(&path);
            }
        }
    }
    
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![scan_temp_dir, clean_temp_dir])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
