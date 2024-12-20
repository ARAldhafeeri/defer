import { DeferredFunction, WrappedFunction } from "../types/defer";

class DeferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeferError";
  }
}

class ExecutionError extends DeferError {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionError";
  }
}

class NestedDefererError extends DeferError {
  constructor(message: string) {
    super(message);
    this.name = "NestedDefererError";
  }
}

class Deferer {
  static stack: DeferredFunction[] = []; // Array to store deferred functions
  static wrapped: boolean = false;

  static defer(fn: DeferredFunction): void {
    this.stack.push(fn);
  }

  static execute(): void {
    while (this.stack.length > 0) {
      const fn = this.stack.pop();
      try {
        if (fn) fn();
      } catch (err) {
        throw new ExecutionError(`Error in deferred function: ${err}`);
      }
    }
    this.wrapped = false;
  }

  static wrapper<T extends any[], R>(
    cp: WrappedFunction<T, R>
  ): WrappedFunction<T, R> {
    return (...args: T): R => {
      if (this.wrapped)
        throw new NestedDefererError("Nested deferers are not supported");
      this.wrapped = true;
      try {
        const v = cp(...args);
        this.execute();
        return v;
      } finally {
        this.wrapped = false;
      }
    };
  }
}

export { DeferError, ExecutionError };
export default Deferer;
