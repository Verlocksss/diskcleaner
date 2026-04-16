use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};
use jwalk::WalkDir;

#[derive(Serialize, Deserialize, Clone)]
pub struct TreeNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub has_children: bool,
}

#[tauri::command]
fn open_folder_picker() -> Option<String> {
    if let Some(folder) = rfd::FileDialog::new().pick_folder() {
        Some(folder.to_string_lossy().into_owned())
    } else {
        None
    }
}

fn get_dir_total_size(path: &Path) -> u64 {
    WalkDir::new(path)
        .skip_hidden(true)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| e.metadata().map(|m| m.len()).unwrap_or(0))
        .sum()
}

#[tauri::command]
fn get_folder_children(path: String) -> Vec<TreeNode> {
    let mut children = Vec::new();
    let root = Path::new(&path);

    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            let p = entry.path();
            let name = p.file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned();

            if p.is_dir() {
                // Check if it has any children to show expansion arrow
                let has_children = fs::read_dir(&p).map(|mut d| d.next().is_some()).unwrap_or(false);

                // High-performance size calculation for the whole tree
                let size = get_dir_total_size(&p);

                children.push(TreeNode {
                    name,
                    path: p.to_string_lossy().into_owned(),
                    is_dir: true,
                    size,
                    has_children,
                });
            } else {
                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                children.push(TreeNode {
                    name,
                    path: p.to_string_lossy().into_owned(),
                    is_dir: false,
                    size,
                    has_children: false,
                });
            }
        }
    }
    
    // Sort directories first, then by size descending
    children.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then(b.size.cmp(&a.size))
    });
    
    children
}

#[tauri::command]
fn clean_paths(paths_to_clean: Vec<String>) -> Result<(), String> {
    for path_str in paths_to_clean {
        let path = Path::new(&path_str);
        if path.exists() {
            if path.is_dir() {
                let _ = fs::remove_dir_all(&path);
            } else {
                let _ = fs::remove_file(&path);
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn empty_dir_contents(path_str: String) -> Result<(), String> {
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
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            open_folder_picker,
            get_folder_children,
            clean_paths,
            empty_dir_contents
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
