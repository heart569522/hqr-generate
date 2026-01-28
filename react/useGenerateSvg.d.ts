import type { GenerateOptions } from "../index";
export declare function useGenerateSvg(text?: string, opts?: GenerateOptions): {
    svg: string | null;
    src: string | null;
    loading: boolean;
    error: unknown;
};
