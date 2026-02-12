export const extractJson = (text: string): any => {
    try {
        // Find the first occurrence of { or [
        const startBracket = text.indexOf('{');
        const startSquare = text.indexOf('[');

        let start = -1;
        if (startBracket !== -1 && (startSquare === -1 || startBracket < startSquare)) {
            start = startBracket;
        } else {
            start = startSquare;
        }

        // Find the last occurrence of } or ]
        const endBracket = text.lastIndexOf('}');
        const endSquare = text.lastIndexOf(']');

        let end = -1;
        if (endBracket !== -1 && (endSquare === -1 || endBracket > endSquare)) {
            end = endBracket;
        } else {
            end = endSquare;
        }

        if (start === -1 || end === -1 || end < start) {
            throw new Error('No valid JSON structure found in text');
        }

        const jsonStr = text.substring(start, end + 1);
        return JSON.parse(jsonStr);
    } catch (error: any) {
        throw new Error(`JSON Extraction failed: ${error.message}`);
    }
};
