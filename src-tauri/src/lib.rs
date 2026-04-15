use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct ScanCategory {
    pub id: String,
    pub name: String,
    pub description: String,
    pub paths: Vec<String>,
    pub size: u64,
    pub file_count: u64,
}

#[derive(Serialize)]
pub struct ScanResult {
    pub categories: Vec<ScanCategory>,
    pub total_size: u64,
}

fn get_dir_stats(path: &Path, stats: &mut (u64, u64)) {
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                stats.1 += 1; // file count
                if let Ok(metadata) = entry.metadata() {
                    stats.0 += metadata.len(); // size
                }
            } else if p.is_dir() {
                get_dir_stats(&p, stats);
            }
        }
    }
}

fn scan_paths(paths: &[PathBuf]) -> (u64, u64) {
    let mut stats = (0, 0); // (size, file_count)
    for p in paths {
        if p.exists() && p.is_dir() {
            get_dir_stats(p, &mut stats);
        }
    }
    stats
}

#[tauri::command]
fn scan_system() -> ScanResult {
    let mut categories = Vec::new();
    let mut total_system_size = 0;

    let local_appdata = env::var("LOCALAPPDATA").unwrap_or_else(|_| String::new());

    // 1. System Temp
    let temp_dir = env::temp_dir();
    let temp_stats = scan_paths(&[temp_dir.clone()]);
    categories.push(ScanCategory {
        id: "sys_temp".to_string(),
        name: "System Temporary Files".to_string(),
        description: "Leftover temporary files created by Windows and applications.".to_string(),
        paths: vec![temp_dir.to_string_lossy().into_owned()],
        size: temp_stats.0,
        file_count: temp_stats.1,
    });

    // 2. Browser Caches
    if !local_appdata.is_empty() {
        let chrome_cache: PathBuf = [&local_appdata, "Google", "Chrome", "User Data", "Default", "Cache", "Cache_Data"].iter().collect();
        let chrome_stats = scan_paths(&[chrome_cache.clone()]);
        categories.push(ScanCategory {
            id: "chrome_cache".to_string(),
            name: "Google Chrome Cache".to_string(),
            description: "Cached website files. Freeing this space is safe but may log you out of some accounts.".to_string(),
            paths: vec![chrome_cache.to_string_lossy().into_owned()],
            size: chrome_stats.0,
            file_count: chrome_stats.1,
        });

        let edge_cache: PathBuf = [&local_appdata, "Microsoft", "Edge", "User Data", "Default", "Cache", "Cache_Data"].iter().collect();
        let edge_stats = scan_paths(&[edge_cache.clone()]);
        categories.push(ScanCategory {
            id: "edge_cache".to_string(),
            name: "Microsoft Edge Cache".to_string(),
            description: "Cached website files for the Edge browser.".to_string(),
            paths: vec![edge_cache.to_string_lossy().into_owned()],
            size: edge_stats.0,
            file_count: edge_stats.1,
        });
    }

    for cat in &categories {
        total_system_size += cat.size;
    }

    ScanResult {
        categories,
        total_size: total_system_size,
    }
}

#[tauri::command]
fn clean_paths(paths_to_clean: Vec<String>) -> Result<(), String> {
    for path_str in paths_to_clean {
        let path = Path::new(&path_str);
        if path.exists() && path.is_dir() {
            if let Ok(entries) = fs::read_dir(path) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_dir() {
                        let _ = fs::remove_dir_all(&p);
                    } else {
                        let _ = fs::remove_file(&p);
                    }
                }
            }
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![scan_system, clean_paths])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
