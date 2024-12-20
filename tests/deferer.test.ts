import Deferer, { ExecutionError } from "../src/defer";
// import fs from "node:fs";

// // Mock functions for file handling
// const mockOpenFile = jest.fn();
// const mockCloseFile = jest.fn();
// const mockProcessFile = jest.fn();

// jest.mock("fs", () => ({
//   openSync: mockOpenFile,
//   closeSync: mockCloseFile,
// }));

describe("Deferer", () => {
  beforeEach(() => {
    Deferer.stack = []; // Reset the stack before each test
    Deferer.wrapped = false;
    // mockOpenFile.mockClear();
    // mockCloseFile.mockClear();
    // mockProcessFile.mockClear();
  });

  test("should execute deferred functions in LIFO order", () => {
    const log: string[] = [];

    Deferer.defer(() => log.push("task 1"));
    Deferer.defer(() => log.push("task 2"));
    Deferer.defer(() => log.push("task 3"));

    Deferer.execute();

    expect(log).toEqual(["task 3", "task 2", "task 1"]);
  });

  // test("should execute file open/close cleanup using defer", () => {
  //   const mockFileDescriptor = 123; // Mock file descriptor

  //   mockOpenFile.mockReturnValue(mockFileDescriptor);

  //   const fileTask = Deferer.wrapper(() => {
  //     const fd = fs.openSync("test.txt", "r"); // Simulate file open
  //     Deferer.defer(() => fs.closeSync(fd)); // Ensure file is closed

  //     mockProcessFile(fd); // Simulate file processing
  //   });

  //   fileTask();

  //   expect(mockOpenFile).toHaveBeenCalledWith("test.txt", "r");
  //   expect(mockProcessFile).toHaveBeenCalledWith(mockFileDescriptor);
  //   expect(mockCloseFile).toHaveBeenCalledWith(mockFileDescriptor);
  // });

  test("should throw error on nested Deferer usage", () => {
    const nestedTask = Deferer.wrapper(() => {
      Deferer.wrapper(() => {
        Deferer.defer(() => console.log("nested task"));
      })();
    });

    expect(() => nestedTask()).toThrow("Nested deferers are not supported");
  });

  test("should handle no deferred functions gracefully", () => {
    expect(() => Deferer.execute()).not.toThrow();
  });

  test("should handle deferred functions with side effects", () => {
    let counter = 0;

    Deferer.defer(() => (counter += 1));
    Deferer.defer(() => (counter += 2));

    Deferer.execute();

    expect(counter).toBe(3); // 2 + 1
  });

  test("should correctly wrap and execute multiple functions", () => {
    const log: string[] = [];
    const task1 = Deferer.wrapper(() => log.push("task 1"));
    const task2 = Deferer.wrapper(() => log.push("task 2"));

    task1();
    task2();

    expect(log).toEqual(["task 1", "task 2"]);
  });

  test("should handle exceptions in wrapped functions", () => {
    const mockError = new Error("Wrapped function error");
    const faultyTask = Deferer.wrapper(() => {
      throw mockError;
    });

    expect(() => faultyTask()).toThrow(mockError);
  });

  // test("should ensure deferred tasks do not execute if wrapper fails", () => {
  //   const mockError = new Error("Failure in main task");

  //   const task = Deferer.wrapper(() => {
  //     Deferer.defer(() => mockProcessFile());
  //     throw mockError;
  //   });

  //   expect(() => task()).toThrow(mockError);
  //   expect(mockProcessFile).not.toHaveBeenCalled();
  // });
});
