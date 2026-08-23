//! Shared value types for the encode and decode pipelines.

/// Error-correction level. Higher levels survive more damage but hold less data.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Ecc {
    /// ~7% recovery.
    L,
    /// ~15% recovery.
    M,
    /// ~25% recovery. Default: the best trade-off for screens and print.
    #[default]
    Q,
    /// ~30% recovery.
    H,
}

impl Ecc {
    /// Fraction of the symbol the level can recover, as a percentage.
    /// Used to decide how much of the centre a logo may blank out.
    #[inline]
    pub fn recovery_percent(self) -> u32 {
        match self {
            Ecc::L => 7,
            Ecc::M => 15,
            Ecc::Q => 25,
            Ecc::H => 30,
        }
    }

    /// FFI decoding. `0=L, 1=M, 2=Q, 3=H`; anything else falls back to `Q`.
    #[inline]
    pub fn from_u8(v: u8) -> Self {
        match v {
            0 => Ecc::L,
            1 => Ecc::M,
            3 => Ecc::H,
            _ => Ecc::Q,
        }
    }
}

/// How `size` maps onto the rendered image.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SizeMode {
    /// The output image is exactly `size` x `size` px. Modules stay on integer
    /// pixel boundaries (no blurry edges); any leftover pixels are split evenly
    /// between the four sides, widening the quiet zone.
    #[default]
    Exact,
    /// The output is the largest whole-module image that fits inside `size`,
    /// so it is usually a little *smaller* than requested and has no extra
    /// padding beyond `margin`.
    Fit,
}

impl SizeMode {
    /// FFI decoding. `0=Exact, 1=Fit`.
    #[inline]
    pub fn from_u8(v: u8) -> Self {
        match v {
            1 => SizeMode::Fit,
            _ => SizeMode::Exact,
        }
    }
}

/// Options for the encode pipeline.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GenerateOptions {
    /// Target edge length of the output image, in pixels, **including the quiet
    /// zone**. See [`SizeMode`] for how it is honoured exactly.
    pub size: u32,
    /// Quiet zone around the symbol, in modules. The QR spec requires 4; going
    /// below that hurts scan reliability.
    pub margin: u32,
    /// Error-correction level.
    pub ecc: Ecc,
    /// Whether `size` is an exact target or an upper bound.
    pub size_mode: SizeMode,
    /// Percentage of the symbol width to blank out in the centre, for a logo.
    /// `0` disables it. Error correction reconstructs the covered modules, so
    /// the request is rejected if it would eat more of the budget than the
    /// chosen [`Ecc`] can spare.
    pub logo_space: u8,
}

impl Default for GenerateOptions {
    fn default() -> Self {
        Self {
            size: 320,
            margin: 4,
            ecc: Ecc::Q,
            size_mode: SizeMode::Exact,
            logo_space: 0,
        }
    }
}

/// 8-bit grayscale bitmap (0 = dark, 255 = light).
///
/// Not on any fast path — the renderers rasterize straight from [`QrModules`].
/// This is the representation for callers who want plain pixels.
pub struct QrBitmap {
    pub width: u32,
    pub height: u32,
    pub pixels: Vec<u8>,
}

/// Module-level QR representation, before rasterization.
///
/// Layout of the rendered image, left to right:
/// `offset` px of padding, then `margin * scale` px of quiet zone, then
/// `n * scale` px of modules, then the quiet zone and padding again.
///
/// `dark[y * n + x]` is true when module `(x, y)` is dark.
pub struct QrModules {
    /// Modules per side (21..=177), excluding the quiet zone.
    pub n: u32,
    /// Quiet zone in modules.
    pub margin: u32,
    /// Pixels per module.
    pub scale: u32,
    /// Extra padding in px on each edge, added so the image lands on exactly
    /// the requested `size` under [`SizeMode::Exact`]. Always 0 under
    /// [`SizeMode::Fit`].
    pub offset: u32,
    /// Final image edge length in px.
    pub img_size: u32,
    /// Side of the blanked centre square in modules; 0 when no logo space was
    /// requested.
    pub logo_modules: u32,
    pub dark: Vec<bool>,
}

// Hand-written so a debug print stays readable: `dark` is up to 31k bools and
// `pixels` up to megabytes, and neither tells you anything at a glance.
impl core::fmt::Debug for QrModules {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("QrModules")
            .field("n", &self.n)
            .field("margin", &self.margin)
            .field("scale", &self.scale)
            .field("offset", &self.offset)
            .field("img_size", &self.img_size)
            .field("logo_modules", &self.logo_modules)
            .finish_non_exhaustive()
    }
}

impl core::fmt::Debug for QrBitmap {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("QrBitmap")
            .field("width", &self.width)
            .field("height", &self.height)
            .finish_non_exhaustive()
    }
}

impl QrModules {
    /// QR version, 1..=40.
    #[inline]
    pub fn version(&self) -> u32 {
        (self.n.saturating_sub(17)) / 4
    }

    #[inline]
    pub fn is_dark(&self, x: u32, y: u32) -> bool {
        self.dark[(y * self.n + x) as usize]
    }

    /// Pixel coordinate of the top-left corner of module `(0, 0)`.
    #[inline]
    pub fn origin_px(&self) -> u32 {
        self.offset + self.margin * self.scale
    }

    /// The blanked centre square in pixels, as `(x, y, side)`. `None` when no
    /// logo space was reserved.
    #[inline]
    pub fn logo_rect_px(&self) -> Option<(u32, u32, u32)> {
        if self.logo_modules == 0 {
            return None;
        }
        let start = (self.n - self.logo_modules) / 2;
        let x = self.origin_px() + start * self.scale;
        Some((x, x, self.logo_modules * self.scale))
    }
}

pub enum DecodeInput<'a> {
    Rgba {
        width: u32,
        height: u32,
        data: &'a [u8],
    },
    ImageBytes(&'a [u8]),
}
