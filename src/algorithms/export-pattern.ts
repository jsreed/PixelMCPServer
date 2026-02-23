/**
 * Resolves a dynamic export filename pattern by substituting `{tokens}` with actual variables.
 * Automatically handles zero-padding (e.g., `{frame:03}`) and safely removes adjacent
 * separators (`_`, `-`, `.`) for any tokens whose values are undefined or empty.
 * 
 * @param pattern The export pattern string (e.g. `"{name}_{tag}_{direction}_{frame:03}.png"`).
 * @param variables A dictionary mapping token names to their string values. 
 *                  Missing tokens (undefined) or empty strings trigger separator cleanup.
 * @returns The resolved filename string.
 */
export function resolveExportPattern(
    pattern: string,
    variables: Record<string, string | number | undefined>
): string {
    let result = pattern;

    // 1. Process all {tokens}
    // We use a regex that matches {tokenName} or {tokenName:padding}
    // E.g., {frame:03}
    const tokenRegex = /{([^:}]+)(?::([^}]+))?}/g;

    // We'll replace tokens iteratively. If a token is valid, we inject the string.
    // If a token is undefined/empty, we temporarily replace it with a unique marker flag
    // so we can surgically clean up the adjacent separators afterwards without breaking
    // intentional adjacent separators elsewhere in the user's string.
    const EMPTY_MARKER = "\x00EMPTY\x00";

    result = result.replace(tokenRegex, (match, tokenName, paddingFormat) => {
        let value = variables[tokenName];

        if (value === undefined || value === null || value === "") {
            return EMPTY_MARKER;
        }

        let strValue = String(value);

        // Handle zero padding if requested (e.g. `03` or `04`)
        if (paddingFormat && /^[0-9]+$/.test(paddingFormat)) {
            // Check if paddingFormat starts with '0', indicating zero-padding
            if (paddingFormat.startsWith('0')) {
                const length = parseInt(paddingFormat, 10);
                strValue = strValue.padStart(length, '0');
            }
        }

        return strValue;
    });

    // 2. Clean up adjacent separators around EMPTY markers
    // Separators defined in the design doc are '_', '-', '.'
    // We need to remove the marker, and AT MOST ONE adjacent separator.
    // It's usually best to remove the preceding separator if it exists, otherwise the trailing one.

    // Regex logic:
    // Match the marker, natively catching an optional leading separator OR an optional trailing separator.
    // However, if there are multiple empty tokens in a row `{tag}_{direction}`, we'd have `_MARKER_MARKER.png`
    // We iterate the cleanup until all markers are gone.

    while (result.includes(EMPTY_MARKER)) {
        // Try to replace: [Separator]? MARKER
        // If we drop a trailing separator instead, we might drop the '.' of ".png".
        // The design doc says: "Tokens with no value... are silently dropped along with their nearest adjacent separator character (_, -, .)."

        // Let's replace `_MARKER` or `-MARKER` or `.MARKER` first.
        // If there is no leading separator, we try to drop a trailing one: `MARKER_` or `MARKER-`.
        // We avoid dropping a trailing `.` if it's right before the file extension, but if the user patterned `{name}.{tag}.png` and tag is empty, dropping the first `.` is correct -> `{name}.png`.

        const leadingSeparatorRegex = new RegExp(`[_\\-\\.]${EMPTY_MARKER}`);
        if (leadingSeparatorRegex.test(result)) {
            result = result.replace(leadingSeparatorRegex, '');
            continue;
        }

        // We only strip `.` if it is a LEADING separator (e.g., `.{marker}`), 
        // to prevent `MARKER.png` from stripping the file extension dot.
        const trailingSeparatorRegex = new RegExp(`${EMPTY_MARKER}[_\\-]`);
        if (trailingSeparatorRegex.test(result)) {
            result = result.replace(trailingSeparatorRegex, '');
            continue;
        }

        // If no adjacent separator exists (e.g. just "MARKER"), remove just the marker.
        result = result.replace(EMPTY_MARKER, '');
    }

    return result;
}
