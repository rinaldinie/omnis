use sysinfo::{Pid, System};

/// Calculates the total resident memory in bytes of a process and ALL its descendants.
/// Correctly accounts for multi-process architectures such as Chromium/WebView2,
/// game launchers, anti-cheat wrappers, and worker subprocesses.
pub fn get_process_tree_memory_bytes(root_pid: u32) -> u64 {
    let mut sys = System::new();
    sys.refresh_processes();
    get_process_tree_memory_from_system(&sys, root_pid)
}

/// Calculates the total resident memory given an existing sysinfo::System snapshot in O(N) single-pass traversal.
pub fn get_process_tree_memory_from_system(sys: &System, root_pid: u32) -> u64 {
    let target_pid = Pid::from(root_pid as usize);
    let mut children_map: std::collections::HashMap<Pid, Vec<Pid>> =
        std::collections::HashMap::new();

    for (pid, proc) in sys.processes() {
        if let Some(parent) = proc.parent() {
            children_map.entry(parent).or_default().push(*pid);
        }
    }

    let mut total_bytes = 0u64;
    let mut queue = std::collections::VecDeque::new();
    let mut visited = std::collections::HashSet::new();

    queue.push_back(target_pid);
    visited.insert(target_pid);

    while let Some(current) = queue.pop_front() {
        if let Some(proc) = sys.process(current) {
            total_bytes = total_bytes.saturating_add(proc.memory());
        }
        if let Some(children) = children_map.get(&current) {
            for child in children {
                if visited.insert(*child) {
                    queue.push_back(*child);
                }
            }
        }
    }

    total_bytes
}

/// Returns the total memory in bytes consumed by the Omnis host process and all its
/// WebView2 / helper child processes.
pub fn get_current_app_memory_bytes() -> u64 {
    get_process_tree_memory_bytes(std::process::id())
}
