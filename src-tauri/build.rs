fn main() {
    // whisper.cpp's Metal code uses `@available`, which needs ___isPlatformVersionAtLeast from clang's
    // runtime. rustc links with -nodefaultlibs, so release builds for an older macOS target fail to link.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        let out = std::process::Command::new("clang").arg("--print-resource-dir").output().expect("clang");
        let dir = String::from_utf8(out.stdout).unwrap();
        println!("cargo:rustc-link-search=native={}/lib/darwin", dir.trim());
        println!("cargo:rustc-link-lib=static=clang_rt.osx");
    }
    tauri_build::build()
}
