export declare type DeferredFunction = () => void; // Type for deferred functions
export type WrappedFunction<T extends any[], R> = (...args: T) => R; // Generic type for wrapped functions
