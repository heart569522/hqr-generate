pub struct QrBitmap {
    pub width: u32,
    pub height: u32,
    pub pixels: Vec<u8>,
}

/// Module-level QR representation (pre-rasterization).
/// `dark[y * n + x]` is true if module (x, y) is dark.
pub struct QrModules {
    pub n: u32,
    pub margin: u32,
    pub scale: u32,
    pub dark: Vec<bool>,
}

impl QrModules {
    #[inline]
    pub fn img_size(&self) -> u32 {
        (self.n + self.margin * 2) * self.scale
    }

    #[inline]
    pub fn is_dark(&self, x: u32, y: u32) -> bool {
        self.dark[(y * self.n + x) as usize]
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
