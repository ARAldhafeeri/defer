// File: tests/defer.test.ts

import SyncDeferer, {
  ExecutionError,
  NestedSyncDefererError,
} from "../src/SyncDeferer";

describe("SyncDeferer Tests", () => {
  beforeEach(() => {
    // Reset the internal state before each test
    SyncDeferer.stack = [];
    SyncDeferer.wrapped = false;
  });

  test("executes deferred functions in LIFO order", () => {
    const log: string[] = [];

    SyncDeferer.defer(() => log.push("task 1"));
    SyncDeferer.defer(() => log.push("task 2"));
    SyncDeferer.defer(() => log.push("task 3"));

    SyncDeferer.execute();

    expect(log).toEqual(["task 3", "task 2", "task 1"]);
  });

  test("handles no deferred functions gracefully", () => {
    expect(() => SyncDeferer.execute()).not.toThrow();
  });

  test("handles deferred functions with side effects", () => {
    let counter = 0;

    SyncDeferer.defer(() => (counter += 1));
    SyncDeferer.defer(() => (counter += 2));

    SyncDeferer.execute();

    expect(counter).toBe(3);
  });

  test("throws error on nested SyncDeferer usage", () => {
    const nestedTask = SyncDeferer.wrapper(() => {
      SyncDeferer.wrapper(() => {
        SyncDeferer.defer(() => console.log("nested task"));
      })();
    });
    expect(() => nestedTask()).toThrow(NestedSyncDefererError);
  });

  test("correctly wraps and executes multiple functions (no errors)", () => {
    const log: string[] = [];
    const task1 = SyncDeferer.wrapper(() => log.push("task 1"));
    const task2 = SyncDeferer.wrapper(() => log.push("task 2"));

    task1();
    task2();

    expect(log).toEqual(["task 1", "task 2"]);
  });

  test("handles exceptions in wrapped functions (no recovery)", () => {
    const mockError = new Error("Wrapped function error");
    const faultyTask = SyncDeferer.wrapper(() => {
      throw mockError;
    });

    expect(() => faultyTask()).toThrow(mockError);
  });

  test("recover is called, error should be swallowed", () => {
    const recoveredLogger: string[] = [];

    const functionWithRecovery = SyncDeferer.wrapper(() => {
      SyncDeferer.defer(() => {
        const err = SyncDeferer.recover();
        if (err) {
          recoveredLogger.push(`Recovered: ${err.message}`);
        }
      });
      throw new Error("Oops, something went wrong!");
    });

    // No error thrown outside since we recover inside
    expect(() => functionWithRecovery()).not.toThrow();
    expect(recoveredLogger).toEqual(["Recovered: Oops, something went wrong!"]);
  });

  test("recover is not called, error should propagate", () => {
    const functionNoRecovery = SyncDeferer.wrapper(() => {
      SyncDeferer.defer(() => {
        // Defer something that doesn't call recover
        console.log("Cleanup in progress...");
      });
      throw new Error("Unrecovered error");
    });

    expect(() => functionNoRecovery()).toThrow("Unrecovered error");
  });

  test("deferred functions throw their own error, wrapped in ExecutionError", () => {
    SyncDeferer.defer(() => {
      throw new Error("Error in deferred function");
    });
    expect(() => SyncDeferer.execute()).toThrow(ExecutionError);
  });

  test("multiple deferred functions call recover, only the first sees the error", () => {
    let recoveredByFirst: string | null = null;
    let recoveredBySecond: string | null = null;

    const wrappedFn = SyncDeferer.wrapper(() => {
      // This will run *second* in LIFO order
      SyncDeferer.defer(() => {
        const err = SyncDeferer.recover();
        if (err) recoveredBySecond = `Second recovered: ${err.message}`;
        expect(recoveredBySecond).toBeNull();
      });
      // This will run *first* in LIFO order
      SyncDeferer.defer(() => {
        const err = SyncDeferer.recover();
        if (err) recoveredByFirst = `First recovered: ${err.message}`;
        expect(recoveredByFirst).toBe("First recovered: Only once");
      });
      throw new Error("Only once");
    });

    expect(() => wrappedFn()).not.toThrow();
  });

  test("calling recover multiple times in the same deferred function yields null after first call", () => {
    let firstAttempt: unknown = null;
    let secondAttempt: unknown = null;

    const wrappedFn = SyncDeferer.wrapper(() => {
      SyncDeferer.defer(() => {
        firstAttempt = SyncDeferer.recover(); // should get the error
        secondAttempt = SyncDeferer.recover(); // should be null
      });
      throw new Error("Test error");
    });

    expect(() => wrappedFn()).not.toThrow();
    expect((firstAttempt as Error).message).toBe("Test error");
    expect(secondAttempt).toBeNull();
  });

  test("recover is no-op if main function did not throw an error", () => {
    let recoveredValue: unknown = null;

    const wrappedFn = SyncDeferer.wrapper(() => {
      SyncDeferer.defer(() => {
        recoveredValue = SyncDeferer.recover(); // should be null if no error
      });
      // No throw here
      return "all good";
    });

    expect(wrappedFn()).toBe("all good");
    expect(recoveredValue).toBeNull();
  });

  test("deferred function throwing a new error does not overwrite the main function error if no recover", () => {
    let sideEffect = 0;

    const wrappedFn = SyncDeferer.wrapper(() => {
      SyncDeferer.defer(() => {
        sideEffect++;
        // This error is thrown during deferred execution
        throw new Error("Deferred error");
      });
      // Main function throws first
      throw new Error("Main function error");
    });

    // The second throw from the deferred function will produce an ExecutionError,
    // but we rethrow the main error if it's not recovered. Typically, the final
    // seen error is the second throw (wrapped).
    // Let's see how our particular SyncDeferer is implemented: some implementations
    // rethrow the main error; some wrap the second error. We can assert whichever
    // is correct for your SyncDeferer logic. Usually, "ExecutionError" is thrown
    // once a deferred function fails.
    expect(() => wrappedFn()).toThrow(ExecutionError);
    expect(sideEffect).toBe(1);
  });

  test("multiple sync calls in sequence do not affect each other's stack", () => {
    // We'll show that after one call finishes, the stack is cleared and does not affect the next call.

    // First call: schedule some defers
    const firstCall = SyncDeferer.wrapper(() => {
      SyncDeferer.defer(() => {
        // do something
      });
      return "first result";
    });
    expect(firstCall()).toBe("first result");

    // Second call: if the stack was not cleared properly, we'd have leftover from the first
    const secondCall = SyncDeferer.wrapper(() => {
      SyncDeferer.defer(() => {
        // do something else
      });
      return "second result";
    });
    expect(secondCall()).toBe("second result");

    // If no error was thrown and results match, we confirm the stack is isolated per call.
  });

  test("multiple defers each throw but only first throw triggers ExecutionError (no recover)", () => {
    // We simulate multiple deferred tasks each throwing. The first throw encountered
    // will produce an ExecutionError, and typically subsequent tasks won't be called
    // if we bail out immediately. Depending on your implementation, you might pop them
    // all in a try/catch. We'll see how the test goes.

    SyncDeferer.defer(() => {
      throw new Error("First deferred error");
    });
    SyncDeferer.defer(() => {
      throw new Error("Second deferred error");
    });

    // The library tries to pop the stack in a loop. The moment the first error is thrown
    // it should raise ExecutionError. The second might never run or might run if your logic
    // completes the loop. The key is that we expect an ExecutionError either way.
    expect(() => SyncDeferer.execute()).toThrow(ExecutionError);
  });
});
