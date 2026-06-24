fn main() {
    println!("cargo:rerun-if-changed=icons/app-icon.svg");
    tauri_build::build()
}
