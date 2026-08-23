use criterion::{Criterion, black_box, criterion_group, criterion_main};
use hqr_generate::{
    GenerateOptions, generate_qr_bitmap, generate_qr_modules, render_png, render_png_modules,
    render_svg_modules,
};

const OPTS: GenerateOptions = GenerateOptions {
    size: 320,
    margin: 4,
    ecc: hqr_generate::Ecc::Q,
    size_mode: hqr_generate::SizeMode::Exact,
    logo_space: 0,
};

const SHORT: &str = "hello world";
const URL: &str = "https://example.com/path?foo=bar&baz=qux&abc=xyz";
const LONG: &str =
    "https://example.com/very/long/path?foo=bar&baz=qux&abc=xyz&more=data&x=1&y=2&z=3";

fn bench_generate(c: &mut Criterion) {
    let mut g = c.benchmark_group("generate_qr_modules");
    for (label, text) in [("short", SHORT), ("url", URL), ("long", LONG)] {
        g.bench_function(label, |b| {
            b.iter(|| generate_qr_modules(black_box(text), OPTS).unwrap())
        });
    }
    g.finish();
}

fn bench_svg(c: &mut Criterion) {
    let m_short = generate_qr_modules(SHORT, OPTS).unwrap();
    let m_long = generate_qr_modules(LONG, OPTS).unwrap();

    let mut g = c.benchmark_group("svg");
    g.bench_function("modules/short", |b| {
        b.iter(|| render_svg_modules(black_box(&m_short)))
    });
    g.bench_function("modules/long", |b| {
        b.iter(|| render_svg_modules(black_box(&m_long)))
    });
    g.finish();
}

fn bench_png(c: &mut Criterion) {
    let m_short = generate_qr_modules(SHORT, OPTS).unwrap();
    let m_long = generate_qr_modules(LONG, OPTS).unwrap();
    let b_short = generate_qr_bitmap(SHORT, OPTS).unwrap();
    let b_long = generate_qr_bitmap(LONG, OPTS).unwrap();

    let mut g = c.benchmark_group("png");
    g.bench_function("1bit/short", |b| {
        b.iter(|| render_png_modules(black_box(&m_short)).unwrap())
    });
    g.bench_function("1bit/long", |b| {
        b.iter(|| render_png_modules(black_box(&m_long)).unwrap())
    });
    g.bench_function("legacy-8bit/short", |b| {
        b.iter(|| render_png(black_box(&b_short)).unwrap())
    });
    g.bench_function("legacy-8bit/long", |b| {
        b.iter(|| render_png(black_box(&b_long)).unwrap())
    });
    g.finish();
}

fn bench_end_to_end(c: &mut Criterion) {
    let mut g = c.benchmark_group("e2e");
    g.bench_function("modules→1bit-png (url)", |b| {
        b.iter(|| {
            let m = generate_qr_modules(black_box(URL), OPTS).unwrap();
            render_png_modules(&m).unwrap()
        })
    });
    g.bench_function("modules→svg (url)", |b| {
        b.iter(|| {
            let m = generate_qr_modules(black_box(URL), OPTS).unwrap();
            render_svg_modules(&m)
        })
    });
    // Legacy pipeline for comparison: bitmap → 8-bit PNG
    g.bench_function("bitmap→8bit-png/legacy (url)", |b| {
        b.iter(|| {
            let bm = generate_qr_bitmap(black_box(URL), OPTS).unwrap();
            render_png(&bm).unwrap()
        })
    });
    g.finish();
}

fn bench_output_size(c: &mut Criterion) {
    // Side-channel: print output sizes once so you can eyeball the payload shrink.
    // Criterion will still measure the function below, but the print runs on setup.
    let m = generate_qr_modules(URL, OPTS).unwrap();
    let bm = generate_qr_bitmap(URL, OPTS).unwrap();

    let svg_new = render_svg_modules(&m);
    let png_new = render_png_modules(&m).unwrap();
    let png_old = render_png(&bm).unwrap();

    eprintln!("---- output sizes (text: url, 320px) ----");
    eprintln!("svg (modules/path) : {} bytes", svg_new.len());
    eprintln!("png (1-bit)        : {} bytes", png_new.len());
    eprintln!("png (legacy 8-bit) : {} bytes", png_old.len());
    eprintln!("-----------------------------------------");

    // A trivial bench so criterion has something to measure in this group.
    c.bench_function("noop (size-report anchor)", |b| b.iter(|| black_box(1)));
}

criterion_group!(
    benches,
    bench_generate,
    bench_svg,
    bench_png,
    bench_end_to_end,
    bench_output_size
);
criterion_main!(benches);
