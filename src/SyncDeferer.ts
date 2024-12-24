// File: src/defer.ts

import { DeferredFunction, WrappedFunction } from "../types/defer";

class SyncDeferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncDefererror";
  }
}

class ExecutionError extends SyncDeferError {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionError";
  }
}

class NestedSyncDefererError extends SyncDeferError {
  constructor(message: string) {
    super(message);
    this.name = "NestedSyncDefererError";
  }
}

/**
 * A class that emulates Go's `defer` and `recover` in JavaScript.
 */
class SyncDeferer {
  /**
   * Stack to store deferred functions (Last-In-First-Out).
   */
  static stack: DeferredFunction[] = [];

  /**
   * Flag to detect nested usage of the `wrapper` function.
   * Go does not allow multiple concurrent defers at the same
   * function-scope the same way, so we replicate that constraint.
   */
  static wrapped: boolean = false;

  /**
   * Stores the error (if any) that might be thrown from the wrapped function.
   * If a deferred function calls `recover()`, it can retrieve this error.
   */
  static currentError: Error | null = null;

  /**
   * Enqueues a function to be executed in LIFO order once
   * the main (wrapped) function finishes or throws an error.
   */
  static defer(fn: DeferredFunction): void {
    this.stack.push(fn);
  }

  /**
   * Executes all functions in the `stack` in LIFO order.
   * If any deferred function itself throws, it is wrapped in an `ExecutionError`.
   */
  static execute(): void {
    while (this.stack.length > 0) {
      const fn = this.stack.pop();
      try {
        if (fn) fn();
      } catch (err) {
        throw new ExecutionError(`Error in deferred function: ${err}`);
      }
    }
  }

  /**
   * A wrapper that emulates Go's "defer" semantics.
   *
   * 1. It sets a flag to prevent nested wrappers.
   * 2. It runs the main function.
   * 3. It executes all deferred functions (in LIFO order).
   * 4. If no recover() call was made in a deferred function, rethrow the error.
   */
  static wrapper<T extends any[], R>(
    cp: WrappedFunction<T, R>
  ): WrappedFunction<T, R> {
    return (...args: T): R => {
      if (this.wrapped) {
        throw new NestedSyncDefererError(
          "Nested SyncDeferers are not supported"
        );
      }

      this.wrapped = true;
      this.currentError = null; // Reset any prior stored error

      try {
        const result = cp(...args);
        // No error thrown, so just execute defers
        this.execute();
        return result;
      } catch (err: any) {
        // An error occurred in the wrapped function
        this.currentError = err;
        // Execute all defers: if a recover() call sets `currentError` to null,
        // that effectively "catches" the error.
        this.execute();

        // If the error was not recovered, rethrow it
        if (this.currentError) {
          throw this.currentError;
        }
        // If the error was recovered, swallow it.
        return undefined as unknown as R;
      } finally {
        this.wrapped = false;
      }
    };
  }

  /**
   * If there is a stored error in `currentError`,
   * returns it and clears `currentError`, effectively "recovering" from the error.
   *
   * If there is no stored error, returns null.
   */
  static recover(): Error | null {
    const err = this.currentError;
    if (err) {
      this.currentError = null;
      return err;
    }
    return null;
  }
}

export { SyncDeferer, SyncDeferError, ExecutionError, NestedSyncDefererError };
export default SyncDeferer;
