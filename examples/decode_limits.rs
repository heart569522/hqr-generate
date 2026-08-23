//! ทดลอง: decoder ยอมรับภาพใหญ่แค่ไหน และเสียหน่วยความจำเท่าไหร่
use barqrcode::{DecodeInput, QrBitmap, decode, render_png};
use std::time::Instant;

fn big_white_png(side: u32) -> Vec<u8> {
    render_png(&QrBitmap {
        width: side,
        height: side,
        pixels: vec![255u8; (side as usize) * (side as usize)],
    })
    .unwrap()
}

fn main() {
    for side in [1000u32, 2000, 4000, 8000, 12000, 16000] {
        let png = big_white_png(side);
        let px = side as u64 * side as u64;
        let luma_mb = px / 1_048_576;

        let t = Instant::now();
        let res = decode(DecodeInput::ImageBytes(&png));
        let ms = t.elapsed().as_millis();

        println!(
            "  {side}x{side} ({:>4} MP)  png {:>7} bytes -> luma ~{:>4} MB  |  {:>6} ms  {}",
            px / 1_000_000,
            png.len(),
            luma_mb,
            ms,
            match res {
                Ok(_) => "decoded".to_string(),
                Err(e) => format!("rejected: {}", e.code()),
            }
        );
    }
}
