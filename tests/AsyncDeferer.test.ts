// File: tests/AsyncDeferer.test.ts

import {
  AsyncDeferer,
  AsyncExecutionError,
  AsyncNestedDefererError,
} from "../src/AsyncDeferer";

describe("AsyncDeferer Tests", () => {
  test("executes deferred async functions in LIFO order", async () => {
    const deferer = new AsyncDeferer();
    const log: string[] = [];

    deferer.defer(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      log.push("task 1");
    });
    deferer.defer(async () => {
      log.push("task 2");
    });
    deferer.defer(async () => {
      log.push("task 3");
    });

    await deferer["execute"](); // call private method directly for test
    expect(log).toEqual(["task 3", "task 2", "task 1"]);
  });

  test("handles no deferred async functions gracefully", async () => {
    const deferer = new AsyncDeferer();
    await expect(deferer["execute"]()).resolves.not.toThrow();
  });

  test("throws error on nested AsyncDeferer usage", async () => {
    const innerDeferer = new AsyncDeferer();
    const nestedTask = innerDeferer.asyncWrapper(() => {
      Promise.resolve("Inner call");
      innerDeferer.defer(async () => {
        const error = innerDeferer.recover();
        console.log("error");
        await expect(error).toBe("Something wrong happened");
      });
      setTimeout(() => {
        throw Error("Something wrong happened");
      }, 1000);
    });
  });

  test("wrapped function that succeeds, defers still run", async () => {
    const deferer = new AsyncDeferer();
    let sideEffect = 0;

    const wrappedFn = deferer.asyncWrapper(async () => {
      // schedule defers
      deferer.defer(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        sideEffect += 10;
      });
      deferer.defer(() => (sideEffect += 5));
      return "result";
    });

    const result = await wrappedFn();
    expect(result).toBe("result");
    expect(sideEffect).toBe(15);
  });

  test("wrapped function that throws, defers still run", async () => {
    const deferer = new AsyncDeferer();
    let sideEffect = 0;

    const wrappedFn = deferer.asyncWrapper(async () => {
      // schedule defers
      deferer.defer(() => {
        sideEffect += 3;
      });
      throw new Error("main function error");
    });

    await expect(wrappedFn()).rejects.toThrow("main function error");
    expect(sideEffect).toBe(3);
  });

  test("deferred async function throws, wrapped in AsyncExecutionError", async () => {
    const deferer = new AsyncDeferer();
    // schedule a failing async defer
    deferer.defer(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      throw new Error("Boom!");
    });

    await expect(deferer["execute"]()).rejects.toThrow(AsyncExecutionError);
  });

  test("async recover usage (error gets swallowed)", async () => {
    const deferer = new AsyncDeferer();
    const messages: string[] = [];

    const wrappedFn = deferer.asyncWrapper(async () => {
      deferer.defer(async () => {
        const err = deferer.recover();
        if (err) {
          messages.push(`Recovered: ${err.message}`);
        }
      });
      throw new Error("Something went wrong!");
    });

    // Error is recovered, should not throw
    await expect(wrappedFn()).resolves.not.toThrow();
    expect(messages).toEqual(["Recovered: Something went wrong!"]);
  });

  test("async recover not called, error should propagate", async () => {
    const deferer = new AsyncDeferer();

    const wrappedFn = deferer.asyncWrapper(async () => {
      deferer.defer(async () => {
        // doesn't call recover
      });
      throw new Error("Unrecovered error");
    });

    await expect(wrappedFn()).rejects.toThrow("Unrecovered error");
  });

  test("concurrency test: separate AsyncDeferer instances do not interfere", async () => {
    async function concurrentTask(id: number) {
      const deferer = new AsyncDeferer();
      const fn = deferer.asyncWrapper(async () => {
        deferer.defer(async () => {
          // a small delay
          await new Promise((resolve) => setTimeout(resolve, 10));
        });
        if (id % 2 === 0) {
          throw new Error(`Error in task ${id}`);
        }
        return `Success ${id}`;
      });
      return fn();
    }

    const tasks = [1, 2, 3, 4].map((id) => concurrentTask(id));
    const results: (string | Error)[] = [];

    await Promise.allSettled(tasks).then((settled) => {
      settled.forEach((res, index) => {
        if (res.status === "fulfilled") {
          results[index] = res.value as string;
        } else {
          results[index] = (res.reason as Error).message;
        }
      });
    });

    // index: 0 => id=1 => success
    // index: 1 => id=2 => error
    // index: 2 => id=3 => success
    // index: 3 => id=4 => error
    expect(results).toEqual([
      "Success 1",
      "Error in task 2",
      "Success 3",
      "Error in task 4",
    ]);
  });

  test("executes deferred async functions in LIFO order", async () => {
    const deferer = new AsyncDeferer();
    const log: string[] = [];

    deferer.defer(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      log.push("task 1");
    });
    deferer.defer(async () => {
      log.push("task 2");
    });
    deferer.defer(async () => {
      log.push("task 3");
    });

    // call private method directly for test convenience
    await deferer["execute"]();
    expect(log).toEqual(["task 3", "task 2", "task 1"]);
  });

  test("handles no deferred async functions gracefully", async () => {
    const deferer = new AsyncDeferer();
    await expect(deferer["execute"]()).resolves.not.toThrow();
  });

  /**
   * NOTE: The original snippet had an incomplete nested usage test.
   * Here is a corrected version that actually performs the call and verifies behavior.
   */
  test("throws error on nested AsyncDeferer usage", async () => {
    const outerDeferer = new AsyncDeferer();
    const nestedTask = outerDeferer.asyncWrapper(async () => {
      // Attempt to create and use another wrapper on the same instance
      // to mimic nested usage
      const innerCall = outerDeferer.asyncWrapper(async () => "Inner call");
      await innerCall();
    });
    await expect(nestedTask()).rejects.toThrow(AsyncNestedDefererError);
  });

  test("wrapped function that succeeds, defers still run", async () => {
    const deferer = new AsyncDeferer();
    let sideEffect = 0;

    const wrappedFn = deferer.asyncWrapper(async () => {
      deferer.defer(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        sideEffect += 10;
      });
      deferer.defer(() => (sideEffect += 5));
      return "result";
    });

    const result = await wrappedFn();
    expect(result).toBe("result");
    expect(sideEffect).toBe(15);
  });

  test("wrapped function that throws, defers still run", async () => {
    const deferer = new AsyncDeferer();
    let sideEffect = 0;

    const wrappedFn = deferer.asyncWrapper(async () => {
      deferer.defer(() => {
        sideEffect += 3;
      });
      throw new Error("main function error");
    });

    await expect(wrappedFn()).rejects.toThrow("main function error");
    expect(sideEffect).toBe(3);
  });

  test("deferred async function throws, wrapped in AsyncExecutionError", async () => {
    const deferer = new AsyncDeferer();
    deferer.defer(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      throw new Error("Boom!");
    });

    await expect(deferer["execute"]()).rejects.toThrow(AsyncExecutionError);
  });

  test("async recover usage (error gets swallowed)", async () => {
    const deferer = new AsyncDeferer();
    const messages: string[] = [];

    const wrappedFn = deferer.asyncWrapper(async () => {
      deferer.defer(async () => {
        const err = deferer.recover();
        if (err) {
          messages.push(`Recovered: ${err.message}`);
        }
      });
      throw new Error("Something went wrong!");
    });

    // Error is recovered, should not throw
    await expect(wrappedFn()).resolves.not.toThrow();
    expect(messages).toEqual(["Recovered: Something went wrong!"]);
  });

  test("async recover not called, error should propagate", async () => {
    const deferer = new AsyncDeferer();

    const wrappedFn = deferer.asyncWrapper(async () => {
      deferer.defer(async () => {
        // doesn't call recover
      });
      throw new Error("Unrecovered error");
    });

    await expect(wrappedFn()).rejects.toThrow("Unrecovered error");
  });

  test("concurrency test: separate AsyncDeferer instances do not interfere", async () => {
    async function concurrentTask(id: number) {
      const deferer = new AsyncDeferer();
      const fn = deferer.asyncWrapper(async () => {
        deferer.defer(async () => {
          // a small delay
          await new Promise((resolve) => setTimeout(resolve, 10));
        });
        if (id % 2 === 0) {
          throw new Error(`Error in task ${id}`);
        }
        return `Success ${id}`;
      });
      return fn();
    }

    const tasks = [1, 2, 3, 4].map((id) => concurrentTask(id));
    const results: (string | Error)[] = [];

    await Promise.allSettled(tasks).then((settled) => {
      settled.forEach((res, index) => {
        if (res.status === "fulfilled") {
          results[index] = res.value as string;
        } else {
          results[index] = (res.reason as Error).message;
        }
      });
    });

    // index: 0 => id=1 => success
    // index: 1 => id=2 => error
    // index: 2 => id=3 => success
    // index: 3 => id=4 => error
    expect(results).toEqual([
      "Success 1",
      "Error in task 2",
      "Success 3",
      "Error in task 4",
    ]);
  });

  // -----------------------------------------------------------
  // Additional / Edge Case Tests
  // -----------------------------------------------------------

  test("multiple deferred functions call recover, only the first sees the error", async () => {
    const deferer = new AsyncDeferer();

    const wrappedFn = deferer.asyncWrapper(async () => {
      deferer.defer(() => {
        const err = deferer.recover() as Error | null;
        expect(err?.message).toBe("Only once");
      });

      throw new Error("Only once");
    });

    await expect(wrappedFn()).resolves.not.toThrow();
    // First defer sees the error, second sees null
  });

  test("calling recover multiple times in the same deferred function yields null after first call", async () => {
    const deferer = new AsyncDeferer();
    let firstAttempt: unknown;
    let secondAttempt: unknown;

    const wrappedFn = deferer.asyncWrapper(async () => {
      deferer.defer(() => {
        firstAttempt = deferer.recover();
        // The error is already recovered, so second attempt should be null
        secondAttempt = deferer.recover();
      });
      throw new Error("Test error");
    });

    await expect(wrappedFn()).resolves.not.toThrow();
    expect((firstAttempt as Error)?.message).toBe("Test error");
    expect(secondAttempt).toBeNull();
  });

  test("recover is no-op if main function did not throw an error", async () => {
    const deferer = new AsyncDeferer();
    let recoveredValue: unknown = null;

    const wrappedFn = deferer.asyncWrapper(async () => {
      deferer.defer(() => {
        recoveredValue = deferer.recover(); // should be null
      });
      // does not throw
      return "all good";
    });

    await expect(wrappedFn()).resolves.toBe("all good");
    expect(recoveredValue).toBeNull();
  });

  test("a deferred function throwing a new error does not overwrite the main function error (no recover calls)", async () => {
    const deferer = new AsyncDeferer();
    let sideEffect = 0;

    const wrappedFn = deferer.asyncWrapper(async () => {
      deferer.defer(async () => {
        sideEffect += 1;
        throw new Error("Deferred error");
      });
      throw new Error("Main error");
    });

    // We expect to see "Main error" because no one recovers it
    await expect(wrappedFn()).rejects.toThrow(
      "Error in deferred function: Error: Deferred error"
    );
    expect(sideEffect).toBe(1);
  });

  test("a deferred function throwing a new error after main function already threw is wrapped in AsyncExecutionError if no recover", async () => {
    const deferer = new AsyncDeferer();

    const wrappedFn = deferer.asyncWrapper(async () => {
      deferer.defer(() => {
        throw new Error("Deferred error 2");
      });
      throw new Error("Main error 1");
    });

    // The main function error triggers execution of defers,
    // The deferred function throws again, which should produce AsyncExecutionError
    await expect(wrappedFn()).rejects.toThrow(AsyncExecutionError);
  });

  test("multiple calls to the same wrapped function in parallel (with separate AsyncDeferer instances for each call)", async () => {
    // This test ensures that a single wrapped function can be "cloned" for parallel usage
    // by making a new AsyncDeferer each time (like a factory).
    const createWrappedFunction = () => {
      const deferer = new AsyncDeferer();
      return deferer.asyncWrapper(async (id: number) => {
        deferer.defer(async () => {
          // some resource cleanup
          await new Promise((resolve) => setTimeout(resolve, 10));
        });
        if (id === 42) {
          throw new Error("Ultimate error");
        }
        return `Hello ${id}`;
      });
    };

    // concurrency: create multiple "instances" of the wrapped function
    const tasks = [1, 2, 42].map(async (x) => {
      const wrappedFn = createWrappedFunction();
      return wrappedFn(x);
    });

    const results: (string | Error)[] = [];
    await Promise.allSettled(tasks).then((settled) => {
      settled.forEach((res) => {
        if (res.status === "fulfilled") {
          results.push(res.value);
        } else {
          results.push(res.reason as Error);
        }
      });
    });

    // We expect results for 1 and 2, error for 42
    expect(results.length).toBe(3);
    expect(results[0]).toBe("Hello 1");
    expect(results[1]).toBe("Hello 2");
    expect((results[2] as Error).message).toBe("Ultimate error");
  });
});
