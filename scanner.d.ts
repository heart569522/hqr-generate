/* =========================================================
 * @wirunrom/hqr-generate/scanner
 *
 * Live camera scanning, framework-agnostic. Browser only.
 * ======================================================= */

import type { DecodedQr } from "./index";

export interface CameraInfo {
  deviceId: string;
  label: string;
}

/** Video input devices. Labels are only populated after permission is granted. */
export function listCameras(): Promise<CameraInfo[]>;

export interface ScannerOptions {
  /** The element the camera stream is attached to. */
  video: HTMLVideoElement;
  /** Called for each code seen, after de-duplication. */
  onResult: (result: DecodedQr) => void;
  /** Unexpected failures only — "no code in this frame" is not reported. */
  onError?: (error: Error) => void;
  /** Default `'environment'` (rear camera). */
  facingMode?: "environment" | "user";
  /** Pick a specific camera from {@link listCameras}. */
  deviceId?: string;
  /** Minimum gap between decode attempts. Default 120 ms. */
  scanIntervalMs?: number;
  /** Longest edge of the buffer actually decoded. Default 640 px. */
  maxSide?: number;
  /** How long the same text is suppressed after a hit. Default 1500 ms. */
  dedupeMs?: number;
}

export interface Scanner {
  /** Stop decoding and release the camera. Safe to call more than once. */
  stop(): void;
  stream: MediaStream;
}

/**
 * Open the camera and start scanning into `video`.
 *
 * Rejects with `CAMERA_DENIED` if the user refuses, or `CAMERA_UNAVAILABLE` if
 * there is no camera or the page is not in a secure context.
 */
export function createScanner(opts: ScannerOptions): Promise<Scanner>;
