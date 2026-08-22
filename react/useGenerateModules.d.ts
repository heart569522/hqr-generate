import type { GenerateOptions, QrModules } from "../index";
/**
 * The QR module grid, for rendering the code yourself — an inline `<svg>` that
 * inherits `currentColor`, a `<canvas>`, a PDF, a print layout.
 *
 * Unlike {@link useGenerate}, nothing here allocates a Blob or an object URL,
 * so there is no URL lifetime to manage and the markup is server-renderable
 * once you have the grid.
 */
export declare function useGenerateModules(text?: string, opts?: GenerateOptions): {
    modules: QrModules | null;
    error: unknown;
    loading: boolean;
};
