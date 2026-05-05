# DiskCleaner Pro

A blazing-fast, custom Windows disk analysis and cleaning utility. Built with Tauri (Rust + TypeScript) to deliver massive parallel performance and seamless UI rendering.

## Features
- **High-Speed Heuristic Scanning**: Recursively scans hundreds of thousands of files instantly using native Rust multi-threading (`jwalk`).
- **Stateful Pre-Scanned Caching**: Caches full directory sizes in RAM for zero-latency, instant UI folder expansion.
- **AI Disk Analysis**: Integrated Gemini AI agent seamlessly inspects folders or files and returns an instant safety diagnostic indicating what the folder is used for and whether it is safe to delete. 
- **Destructive Tools**: Safely delete files or empty entire directory trees.

## How to Build

To compile DiskCleaner into a standalone `.exe` native Windows executable, open your terminal in this directory and run:

```bash
npm run tauri build
```

The final optimized executable will be generated inside the `src-tauri/target/release/` directory.

### Running in Development
To run the live hot-reloading development server, run:
```bash
npm run tauri dev
```
