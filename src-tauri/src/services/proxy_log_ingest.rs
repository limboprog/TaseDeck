use crate::core::fs::proxy_spool_dir;
use crate::db::{truncate_usage_result, UsageLogEntry};
use crate::services::usage_log::is_user_visible_tool_call;
use crate::services::UsageLogStore;
use serde::Deserialize;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProxyLogLine {
    mcp_name: String,
    tool_name: String,
    caller: String,
    success: bool,
    result: String,
    created_at: String,
    #[serde(default)]
    project_id: i64,
}

pub struct ProxyLogIngestor {
    usage_log: Arc<UsageLogStore>,
    offsets: Mutex<HashMap<PathBuf, u64>>,
    running: AtomicBool,
}

impl ProxyLogIngestor {
    pub fn new(usage_log: Arc<UsageLogStore>) -> Self {
        Self {
            usage_log,
            offsets: Mutex::new(HashMap::new()),
            running: AtomicBool::new(false),
        }
    }

    pub fn start_background(self: &Arc<Self>) {
        if self.running.swap(true, Ordering::SeqCst) {
            return;
        }

        let ingestor = Arc::clone(self);
        thread::spawn(move || {
            while ingestor.running.load(Ordering::Relaxed) {
                if let Err(error) = ingestor.poll_once() {
                    eprintln!("proxy log ingest failed: {error}");
                }
                thread::sleep(Duration::from_secs(2));
            }
        });
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
    }

    pub fn poll_once(&self) -> Result<usize, String> {
        let files = discover_proxy_spool_files()?;
        let mut ingested = 0usize;

        for path in files {
            ingested += self.ingest_file(&path)?;
        }

        Ok(ingested)
    }

    fn ingest_file(&self, path: &Path) -> Result<usize, String> {
        let mut file = File::open(path).map_err(|error| error.to_string())?;
        let file_len = file.metadata().map_err(|error| error.to_string())?.len();
        let start_offset = {
            let mut offsets = self.offsets.lock().map_err(|_| "offset lock poisoned")?;
            *offsets.entry(path.to_path_buf()).or_insert(0)
        };

        if start_offset >= file_len {
            return Ok(0);
        }

        file.seek(SeekFrom::Start(start_offset))
            .map_err(|error| error.to_string())?;
        let mut reader = BufReader::new(file);
        let mut line = String::new();
        let mut ingested = 0usize;
        let mut next_offset = start_offset;

        while {
            line.clear();
            reader.read_line(&mut line).map_err(|error| error.to_string())?
        } > 0
        {
            next_offset += line.len() as u64;
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let parsed: ProxyLogLine = match serde_json::from_str(trimmed) {
                Ok(value) => value,
                Err(_) => continue,
            };

            let entry = UsageLogEntry {
                id: 0,
                mcp_name: parsed.mcp_name,
                tool_name: parsed.tool_name,
                caller: parsed.caller,
                success: parsed.success,
                result: truncate_usage_result(&parsed.result),
                created_at: parsed.created_at,
                project_id: (parsed.project_id > 0).then_some(parsed.project_id),
            };

            if !is_user_visible_tool_call(&entry) {
                continue;
            }

            if self
                .usage_log
                .ingest_external_entry(entry)
                .map_err(|error| error.to_string())?
            {
                ingested += 1;
            }
        }

        if let Ok(mut offsets) = self.offsets.lock() {
            if next_offset >= file_len {
                offsets.insert(path.to_path_buf(), 0);
                drop(offsets);
                let _ = File::create(path);
            } else {
                offsets.insert(path.to_path_buf(), next_offset);
            }
        }

        Ok(ingested)
    }
}

fn discover_proxy_spool_files() -> Result<Vec<PathBuf>, String> {
    let root = proxy_spool_dir();
    if !root.is_dir() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    collect_spool_files(&root, &mut files);
    files.sort();
    files.dedup();
    Ok(files)
}

fn collect_spool_files(dir: &Path, files: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_spool_files(&path, files);
            continue;
        }
        if path.extension().is_some_and(|ext| ext == "jsonl") {
            files.push(path);
        }
    }
}
