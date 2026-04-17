use core::fmt::Write;

use crate::core::types::{QrBitmap, QrModules};

/// Render SVG directly from the module grid — O(n²) over modules (~29²),
/// not over scaled pixels (~400²). Runs of adjacent dark modules on the
/// same row are merged into a single `<rect>` to shrink output further.
pub fn render_svg_modules(m: &QrModules) -> String {
    let img = m.img_size();

    // Rough capacity: header + ~12 bytes per dark run in the path `d`.
    let est = 256 + (m.n * m.n) as usize * 6;
    let mut out = String::with_capacity(est);

    let _ = write!(
        out,
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="{0}" height="{0}" viewBox="0 0 {0} {0}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path fill="black" d=""#,
        img
    );

    let n = m.n;
    let margin = m.margin;
    let scale = m.scale;

    // One <path> with sub-paths per horizontal run of dark modules.
    // Each subpath uses *relative* `m` from the previous position → shorter `d`.
    let mut cx: i64 = 0;
    let mut cy: i64 = 0;
    for y in 0..n {
        let py = ((y + margin) * scale) as i64;
        let mut x = 0;
        while x < n {
            if !m.is_dark(x, y) {
                x += 1;
                continue;
            }
            let start = x;
            x += 1;
            while x < n && m.is_dark(x, y) {
                x += 1;
            }
            let run = x - start;
            let px = ((start + margin) * scale) as i64;
            let w = (run * scale) as i64;

            // Relative move from current pen position, then draw closed rect.
            let _ = write!(out, "m{} {}h{}v{}h-{}z", px - cx, py - cy, w, scale, w);
            // `z` returns pen to subpath start (px, py) — that's our new cursor.
            cx = px;
            cy = py;
        }
    }

    out.push_str(r#""/></svg>"#);
    out
}

/// Legacy API: render SVG from a rasterized bitmap. Prefer `render_svg_modules`.
/// Kept for backwards compatibility with the previous public signature.
pub fn render_svg(bitmap: &QrBitmap) -> String {
    let size = bitmap.width;
    let est = 256 + bitmap.pixels.len() / 4;
    let mut out = String::with_capacity(est);

    let _ = write!(
        out,
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="{0}" height="{0}" viewBox="0 0 {0} {0}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/>"#,
        size
    );

    let w = bitmap.width as usize;
    for y in 0..bitmap.height as usize {
        let row = &bitmap.pixels[y * w..(y + 1) * w];
        let mut x = 0;
        while x < w {
            if row[x] != 0 {
                x += 1;
                continue;
            }
            let start = x;
            x += 1;
            while x < w && row[x] == 0 {
                x += 1;
            }
            let _ = write!(
                out,
                r#"<rect x="{}" y="{}" width="{}" height="1" fill="black"/>"#,
                start,
                y,
                x - start
            );
        }
    }

    out.push_str("</svg>");
    out
}
