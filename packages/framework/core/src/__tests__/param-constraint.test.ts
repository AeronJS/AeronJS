import { describe, expect, test } from "bun:test";
import { isValidParamType, paramTypes } from "../param-constraint";

describe("paramTypes", () => {
  test("string accepts any non-slash string", () => {
    expect(paramTypes.string.pattern.test("hello")).toBe(true);
    expect(paramTypes.string.pattern.test("hello-world")).toBe(true);
    expect(paramTypes.string.coerce("hello")).toBe("hello");
  });

  test("int matches integers and coerces to number", () => {
    expect(paramTypes.int.pattern.test("42")).toBe(true);
    expect(paramTypes.int.pattern.test("-3")).toBe(true);
    expect(paramTypes.int.pattern.test("0")).toBe(true);
    expect(paramTypes.int.pattern.test("3.14")).toBe(false);
    expect(paramTypes.int.pattern.test("abc")).toBe(false);
    expect(paramTypes.int.coerce("42")).toBe(42);
    expect(paramTypes.int.coerce("-3")).toBe(-3);
  });

  test("float matches numbers and coerces to number", () => {
    expect(paramTypes.float.pattern.test("3.14")).toBe(true);
    expect(paramTypes.float.pattern.test("-0.5")).toBe(true);
    expect(paramTypes.float.pattern.test("42")).toBe(true);
    expect(paramTypes.float.pattern.test("abc")).toBe(false);
    expect(paramTypes.float.coerce("3.14")).toBe(3.14);
    expect(paramTypes.float.coerce("-0.5")).toBe(-0.5);
  });

  test("bool matches boolean strings and coerces to boolean", () => {
    expect(paramTypes.bool.pattern.test("true")).toBe(true);
    expect(paramTypes.bool.pattern.test("false")).toBe(true);
    expect(paramTypes.bool.pattern.test("1")).toBe(true);
    expect(paramTypes.bool.pattern.test("0")).toBe(true);
    expect(paramTypes.bool.pattern.test("yes")).toBe(false);
    expect(paramTypes.bool.coerce("true")).toBe(true);
    expect(paramTypes.bool.coerce("1")).toBe(true);
    expect(paramTypes.bool.coerce("false")).toBe(false);
    expect(paramTypes.bool.coerce("0")).toBe(false);
  });

  test("uuid matches valid UUIDs", () => {
    expect(paramTypes.uuid.pattern.test("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(paramTypes.uuid.pattern.test("not-a-uuid")).toBe(false);
    expect(paramTypes.uuid.coerce("550e8400-e29b-41d4-a716-446655440000")).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
  });

  test("date matches ISO 8601 strings and coerces to Date", () => {
    expect(paramTypes.date.pattern.test("2024-01-15T10:30:00Z")).toBe(true);
    expect(paramTypes.date.pattern.test("2024-01-15T10:30:00.123Z")).toBe(true);
    expect(paramTypes.date.pattern.test("2024-01-15T10:30:00+08:00")).toBe(true);
    expect(paramTypes.date.pattern.test("2024-01-15")).toBe(false);
    const d = paramTypes.date.coerce("2024-01-15T10:30:00Z") as Date;
    expect(d instanceof Date).toBe(true);
    expect(d.toISOString()).toBe("2024-01-15T10:30:00.000Z");
  });
});

describe("isValidParamType", () => {
  test("returns true for valid types", () => {
    expect(isValidParamType("string")).toBe(true);
    expect(isValidParamType("int")).toBe(true);
    expect(isValidParamType("float")).toBe(true);
    expect(isValidParamType("bool")).toBe(true);
    expect(isValidParamType("uuid")).toBe(true);
    expect(isValidParamType("date")).toBe(true);
  });

  test("returns false for invalid types", () => {
    expect(isValidParamType("slug")).toBe(false);
    expect(isValidParamType("numeric")).toBe(false);
    expect(isValidParamType("bigint")).toBe(false);
  });
});
