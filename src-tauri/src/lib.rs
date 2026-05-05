use std::fs;
use std::path::Path;
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use std::collections::HashMap;
use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use jwalk::WalkDir;
use tauri::{AppHandle, Emitter, State};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

struct AppState {
    dir_sizes: Mutex<HashMap<String, u64>>,
}

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

#[tauri::command]
async fn scan_directory(state: State<'_, AppState>, root_path: String) -> Result<(), String> {
    let mut dir_sizes: HashMap<String, u64> = HashMap::new();
    
    // Minimalist O(N) sweep to only aggregate sizes without building RAM-heavy tree models
    for entry in WalkDir::new(&root_path).skip_hidden(true) {
        if let Ok(e) = entry {
            if !e.file_type().is_dir() {
                let size = e.metadata().map(|m| m.len()).unwrap_or(0);
                if size > 0 {
                    let path_buf = e.path();
                    let mut current = path_buf.parent();
                    while let Some(parent) = current {
                        let path_str = parent.to_string_lossy().into_owned();
                        *dir_sizes.entry(path_str).or_insert(0) += size;
                        current = parent.parent();
                    }
                }
            }
        }
    }

    let mut cache = state.dir_sizes.lock().unwrap();
    *cache = dir_sizes;
    Ok(())
}

#[tauri::command]
fn get_folder_children(state: State<'_, AppState>, path: String) -> Vec<TreeNode> {
    let mut children = Vec::new();
    let root = Path::new(&path);
    
    let cache = state.dir_sizes.lock().unwrap();

    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            let p = entry.path();
            let name = p.file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned();
            let path_str = p.to_string_lossy().into_owned();

            if p.is_dir() {
                let has_children = fs::read_dir(&p).map(|mut d| d.next().is_some()).unwrap_or(false);
                let size = cache.get(&path_str).cloned().unwrap_or(0);

                children.push(TreeNode {
                    name, path: path_str, is_dir: true, size, has_children,
                });
            } else {
                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                children.push(TreeNode {
                    name, path: path_str, is_dir: false, size, has_children: false,
                });
            }
        }
    }
    
    children.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(b.size.cmp(&a.size)));
    children
}

fn force_remove_file(path: &Path) -> std::io::Result<()> {
    match fs::remove_file(path) {
        Ok(_) => Ok(()),
        Err(e) => {
            if e.raw_os_error() == Some(5) {
                if let Ok(metadata) = fs::metadata(path) {
                    let mut perms = metadata.permissions();
                    if perms.readonly() {
                        #[allow(clippy::permissions_set_readonly_false)]
                        perms.set_readonly(false);
                        let _ = fs::set_permissions(path, perms);
                        return fs::remove_file(path);
                    }
                }
            }
            Err(e)
        }
    }
}

#[tauri::command]
fn clean_paths(state: State<'_, AppState>, paths_to_clean: Vec<String>) -> Result<(), String> {
    let mut cache = state.dir_sizes.lock().unwrap();

    for path_str in paths_to_clean {
        let path = Path::new(&path_str);
        let mut deleted_size = 0;
        
        if path.exists() {
            if path.is_dir() {
                deleted_size = cache.get(&path_str).cloned().unwrap_or(0);
                fs::remove_dir_all(&path).map_err(|e| format!("Failed to delete directory {}: {}", path_str, e))?;
            } else {
                deleted_size = path.metadata().map(|m| m.len()).unwrap_or(0);
                force_remove_file(&path).map_err(|e| format!("Failed to delete file {}: {}", path_str, e))?;
            }
        }
        
        if deleted_size > 0 {
            let mut current = path.parent();
            while let Some(parent) = current {
                let p_str = parent.to_string_lossy().into_owned();
                if let Some(size) = cache.get_mut(&p_str) {
                    *size = size.saturating_sub(deleted_size);
                }
                current = parent.parent();
            }
            cache.remove(&path_str);
        }
    }
    Ok(())
}

#[tauri::command]
fn empty_dir_contents(state: State<'_, AppState>, path_str: String) -> Result<(), String> {
    let path = Path::new(&path_str);
    if path.exists() && path.is_dir() {
        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    fs::remove_dir_all(&p).map_err(|e| format!("Failed to delete subfolder {:?}: {}", p, e))?;
                } else {
                    force_remove_file(&p).map_err(|e| format!("Failed to delete file {:?}: {}", p, e))?;
                }
            }
        }
    }
    
    let mut cache = state.dir_sizes.lock().unwrap();
    if let Some(&deleted_size) = cache.get(&path_str) {
        if deleted_size > 0 {
            let mut current = path.parent();
            while let Some(parent) = current {
                let p_str = parent.to_string_lossy().into_owned();
                if let Some(size) = cache.get_mut(&p_str) {
                    *size = size.saturating_sub(deleted_size);
                }
                current = parent.parent();
            }
            cache.insert(path_str, 0);
        }
    }
    Ok(())
}

#[tauri::command]
async fn analyze_directory_ai(app: AppHandle, path: String) -> Result<(), String> {
    let path_obj = Path::new(&path);
    let is_dir = path_obj.is_dir();
    let include_dir = if is_dir {
        path.clone()
    } else {
        path_obj.parent().unwrap_or(path_obj).to_string_lossy().into_owned()
    };

    let prompt = if is_dir {
        format!("Analyze the Windows directory at '{}'. Please use your tools to check its contents. Based on the contents, explain what this folder is used for and whether it is safe to delete. Respond instantly with EXACTLY 2 points: 1. What is this dir used for? 2. Is it dangerous to delete?", path)
    } else {
        format!("Analyze the Windows file at '{}'. Please use your tools to examine the file or its metadata. Based on the examination, explain what this file is used for and whether it is safe to delete. Respond instantly with EXACTLY 2 points: 1. What is this file used for? 2. Is it dangerous to delete?", path)
    };
    
    let mut cmd = if cfg!(windows) {
        Command::new("gemini.cmd")
    } else {
        Command::new("gemini")
    };

    cmd.args(["-y", "-o", "text", "-p", &prompt, "-m", "gemini-3-flash-preview", "--include-directories", &include_dir])
        .env("CI", "true")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to execute gemini CLI: {}", e))?;

    if let Some(stdout) = child.stdout.take() {
        let app_clone = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().filter_map(|l| l.ok()) {
                if line.trim().is_empty() || line.contains("YOLO mode is enabled") { continue; }
                let _ = app_clone.emit("gemini-stream", line);
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        let app_clone = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().filter_map(|l| l.ok()) {
                if line.trim().is_empty() || line.contains("node:") || line.contains("node_modules") || line.contains("AttachConsole") || line.contains("^") || line.contains("at ") || line.contains("var consoleProcessList") { continue; }
                let _ = app_clone.emit("gemini-stream", line);
            }
        });
    }

    std::thread::spawn(move || {
        let _ = child.wait();
        let _ = app.emit("gemini-done", true);
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            dir_sizes: Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            open_folder_picker,
            scan_directory,
            get_folder_children,
            clean_paths,
            empty_dir_contents,
            analyze_directory_ai
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gemini_cli_invocation() {
        let prompt = "Respond EXACTLY with the word 'Test'. Do not use any tools.";
        let mut cmd = if cfg!(windows) {
            std::process::Command::new("gemini.cmd")
        } else {
            std::process::Command::new("gemini")
        };
        
        let output = cmd.args(["-y", "-o", "text", "-p", prompt, "-m", "gemini-3-flash-preview"])
            .env("CI", "true")
            .output()
            .expect("Failed to execute gemini cmd");
            
        assert!(output.status.success(), "Gemini CLI failed! Stderr: {}", String::from_utf8_lossy(&output.stderr));
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        assert!(stdout.contains("Test"), "Stdout did not contain expected output: {}", stdout);
    }
}
