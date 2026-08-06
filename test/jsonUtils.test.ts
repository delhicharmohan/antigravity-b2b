import { expect, test, describe } from "bun:test";
import { extractJson } from "../src/utils/jsonUtils";

describe("extractJson", () => {
  test("should extract a simple JSON object", () => {
    const input = '{"key": "value"}';
    const result = extractJson(input);
    expect(result).toEqual({ key: "value" });
  });

  test("should extract a simple JSON array", () => {
    const input = '[1, 2, 3]';
    const result = extractJson(input);
    expect(result).toEqual([1, 2, 3]);
  });

  test("should extract JSON embedded in text", () => {
    const input = 'Here is some data: {"id": 1, "name": "Test"} and some more text.';
    const result = extractJson(input);
    expect(result).toEqual({ id: 1, name: "Test" });
  });

  test("should extract nested JSON structures", () => {
    const input = '{"outer": {"inner": [1, 2]}}';
    const result = extractJson(input);
    expect(result).toEqual({ outer: { inner: [1, 2] } });
  });

  test("should throw error if no brackets are found", () => {
    const input = 'No JSON here';
    expect(() => extractJson(input)).toThrow("JSON Extraction failed: No valid JSON structure found in text");
  });

  test("should throw error if brackets are reversed", () => {
    const input = 'End } then Start {';
    expect(() => extractJson(input)).toThrow("JSON Extraction failed: No valid JSON structure found in text");
  });

  test("should throw error for missing closing bracket", () => {
    const input = '{"key": "unclosed"';
    expect(() => extractJson(input)).toThrow("JSON Extraction failed: No valid JSON structure found in text");
  });

  test("should throw error for malformed JSON structure within brackets", () => {
    const input = '{"key": "value" "invalid": 1}';
    expect(() => extractJson(input)).toThrow(/JSON Extraction failed: (JSON Parse error|Unexpected token)/);
  });

  test("should handle multiple disjoint JSON structures by picking outermost bounds", () => {
    // Current implementation: picks first { or [ and last } or ]
    const input = 'First {"a": 1} and Second {"b": 2}';
    // This will try to parse '{"a": 1} and Second {"b": 2}' which is invalid JSON
    expect(() => extractJson(input)).toThrow(/JSON Extraction failed: (JSON Parse error|Unexpected token)/);
  });

  test("should throw error for empty string", () => {
    const input = '';
    expect(() => extractJson(input)).toThrow("JSON Extraction failed: No valid JSON structure found in text");
  });

  test("should handle JSON starting with [ and ending with } incorrectly (current limitation)", () => {
      const input = "[1, 2] text { \"a\": 1 }";
      // start will be 0 ([), end will be last (})
      // resulting string: "[1, 2] text { \"a\": 1 }"
      expect(() => extractJson(input)).toThrow(/JSON Extraction failed/);
  });
});
