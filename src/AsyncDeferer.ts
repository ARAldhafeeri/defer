// File: src/AsyncDeferer.ts

export class AsyncDeferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AsyncDeferError";
  }
}

export class AsyncExecutionError extends AsyncDeferError {
  constructor(message: string) {
    super(message);
    this.name = "AsyncExecutionError";
  }
}

export class AsyncNestedDefererError extends AsyncDeferError {
  constructor(message: string) {
    super(message);
    this.name = "AsyncNestedDefererError";
  }
}

/**
 * A function that takes no parameters, can be synchronous or asynchronous,
 * and returns a promise or a value.
 */
export type AsyncDeferredFunction = () => any | Promise<any>;

/**
 * A function to be wrapped, can be sync or async, receiving arguments
 * of type T and returning a value or Promise of type R.
 */
export type AsyncWrappedFunction<T extends any[], R> = (
  ...args: T
) => R | Promise<R>;

/**
 * `AsyncDeferer` is an instance-based approach to emulate Go-style
 * defer and recover in JavaScript with async/await support.
 *
 * Usage:
 * const deferer = new AsyncDeferer();
 * const wrappedFn = deferer.asyncWrapper(async () => {
 *    // main logic
 *    // schedule cleanup
 *    deferer.defer(() => console.log("cleanup"));
 * });
 *
 * await wrappedFn();
 */
export class AsyncDeferer {
  private stack: AsyncDeferredFunction[] = [];
  private wrapped: boolean = false;
  private currentError: Error | null = null;

  /**
   * Push an async (or sync) function onto the stack to be called
   * in LIFO order when the main function ends or throws.
   */
  public defer(fn: AsyncDeferredFunction): void {
    this.stack.push(fn);
  }

  /**
   * Execute all deferred functions (async or sync) in LIFO order.
   * If any deferred function throws, wrap the error in `AsyncExecutionError`.
   */
  private async execute(): Promise<void> {
    while (this.stack.length > 0) {
      const fn = this.stack.pop();
      if (!fn) continue;
      try {
        // Each deferred function may return a Promise or a value
        await fn();
      } catch (err) {
        throw new AsyncExecutionError(`Error in deferred function: ${err}`);
      }
    }
  }

  /**
   * Wraps a function with the "async-defer" environment. When invoked:
   * 1. Checks if we are already in a wrapped environment (to avoid nesting).
   * 2. Captures errors from the wrapped function.
   * 3. Executes deferred functions in LIFO order.
   * 4. If no deferred function calls `recover()`, rethrows the error.
   */
  public asyncWrapper<T extends any[], R>(
    fn: AsyncWrappedFunction<T, R>
  ): AsyncWrappedFunction<T, Promise<R>> {
    return async (...args: T): Promise<R> => {
      if (this.wrapped) {
        throw new AsyncNestedDefererError(
          "Nested async defer calls are not supported"
        );
      }

      this.wrapped = true;
      this.currentError = null;

      try {
        const result = await fn(...args);
        // If the main function succeeds, still execute deferred tasks
        await this.execute();
        return result;
      } catch (err) {
        this.currentError = err;
        // Execute deferred tasks, giving them a chance to recover
        await this.execute();

        // If `recover()` was never called, rethrow
        if (this.currentError) {
          throw this.currentError;
        }
        // Otherwise swallow the error if recovered
        return undefined as unknown as R;
      } finally {
        // Reset
        this.wrapped = false;
      }
    };
  }

  /**
   * If an error is captured, returns it and clears the stored error,
   * effectively 'recovering' from it.
   */
  public recover(): Error {
    const err = this.currentError;
    if (err) {
      this.currentError = null;
      return err;
    }
    return null;
  }
}
