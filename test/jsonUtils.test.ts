import { describe, expect, it } from "bun:test";
import { extractJson } from "../src/utils/jsonUtils";

describe("extractJson", () => {
    // Happy Paths
    it("should extract a simple JSON object", () => {
        const input = '{"key": "value"}';
        expect(extractJson(input)).toEqual({ key: "value" });
    });

    it("should extract a simple JSON array", () => {
        const input = '[1, 2, 3]';
        expect(extractJson(input)).toEqual([1, 2, 3]);
    });

    it("should extract JSON from surrounding text", () => {
        const input = 'The response is: {"id": 123, "status": "ok"} - please process it.';
        expect(extractJson(input)).toEqual({ id: 123, status: "ok" });
    });

    it("should extract a nested JSON structure", () => {
        const input = 'Data: {"a": [1, 2, {"b": 3}]}';
        expect(extractJson(input)).toEqual({ a: [1, 2, { b: 3 }] });
    });

    it("should handle JSON with newlines and whitespace", () => {
        const input = `
            {
                "name": "test",
                "values": [1, 2]
            }
        `;
        expect(extractJson(input)).toEqual({ name: "test", values: [1, 2] });
    });

    it("should prioritize the first bracket type encountered", () => {
        const input = 'Text [1, 2, 3] more text {"a": 1}';
        // start will be [ (index 5)
        // end will be } (index 32)
        // substring will be "[1, 2, 3] more text {"a": 1}"
        // This should fail to parse
        expect(() => extractJson(input)).toThrow(/JSON Extraction failed/);
    });

    // Edge Cases & Errors
    it("should throw error for empty string", () => {
        expect(() => extractJson("")).toThrow("JSON Extraction failed: No valid JSON structure found in text");
    });

    it("should throw error for string with no brackets", () => {
        expect(() => extractJson("just some plain text")).toThrow("JSON Extraction failed: No valid JSON structure found in text");
    });

    it("should throw error for reversed brackets", () => {
        expect(() => extractJson("} some text {")).toThrow("JSON Extraction failed: No valid JSON structure found in text");
    });

    it("should throw error for single bracket", () => {
        expect(() => extractJson("{")).toThrow("JSON Extraction failed: No valid JSON structure found in text");
        expect(() => extractJson("[")).toThrow("JSON Extraction failed: No valid JSON structure found in text");
    });

    it("should throw error for invalid JSON content inside brackets", () => {
        const input = '{"key": incomplete';
        expect(() => extractJson(input)).toThrow(/JSON Extraction failed/);
    });

    it("should throw error for mismatched nested brackets if it results in invalid JSON", () => {
        const input = '{"a": [1, 2}';
        expect(() => extractJson(input)).toThrow(/JSON Extraction failed/);
    });
});
