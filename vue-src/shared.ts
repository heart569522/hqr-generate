import type { MaybeRefOrGetter } from "vue";
import type { GenerateOptions } from "../index";

/**
 * Options accepted as any mix of plain values, refs and getters — so
 * `{ size: 320 }`, `mySizeRef` and `() => props.size` all work.
 */
export type MaybeRefOptions = {
  [K in keyof GenerateOptions]: MaybeRefOrGetter<GenerateOptions[K]>;
};

/**
 * Whether the browser APIs this package needs are actually present.
 *
 * This matters more in Vue than in React. `watchEffect` runs immediately,
 * including during server-side rendering, whereas React's `useEffect` never
 * runs on the server. Without this guard a Nuxt page would try to `fetch()` the
 * WASM binary while rendering on the server and fail.
 *
 * Generation is therefore deferred to the client. To put a QR code in the
 * server-rendered HTML instead, call the package's Node API directly from a
 * server route or `useAsyncData` — it is synchronous there.
 */
export const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";
