export interface ScanResult {
    text: string;
    version: number;
    eccLevel: number;
    corners: {
        x: number;
        y: number;
    }[];
}
export interface UseQrScannerOptions {
    /** Start the camera. Set to false to release it without unmounting. */
    enabled?: boolean;
    /** Called for every code seen, after de-duplication. */
    onResult?: (result: ScanResult) => void;
    facingMode?: "environment" | "user";
    deviceId?: string;
    /** Minimum gap between decode attempts. Default 120 ms. */
    scanIntervalMs?: number;
    /** Longest edge of the buffer actually decoded. Default 640 px. */
    maxSide?: number;
    /** How long the same text is suppressed after a hit. Default 1500 ms. */
    dedupeMs?: number;
}
/**
 * Live QR scanning from the device camera.
 *
 * ```tsx
 * const { videoRef, result, error } = useQrScanner({ onResult: (r) => console.log(r.text) });
 * return <video ref={videoRef} playsInline muted />;
 * ```
 *
 * The camera is released on unmount and whenever `enabled` goes false.
 */
export declare function useQrScanner(opts?: UseQrScannerOptions): {
    videoRef: import("react").RefObject<HTMLVideoElement | null>;
    result: ScanResult | null;
    error: unknown;
    running: boolean;
    reset: () => void;
};
