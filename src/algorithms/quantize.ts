export type QuantizationResult = {
    palette: Map<number, string>;
    indices: number[];
};

/**
 * Quantizes a 32-bit RGBA pixel array down to an indexed palette of at most `maxColors`.
 * Implements the Median Cut algorithm for color reduction, preserving Index 0 for perfect transparency.
 * 
 * @param pixels A flat array of straight RGBA values [R, G, B, A, R, G, B, A...]
 * @param maxColors The maximum number of colors (including transparency) in the resulting palette (e.g. 256 for 8-bit).
 * @returns An object containing the generated CSS hex palette map and the flat array of pixel indices.
 */
export function quantize(pixels: Uint8ClampedArray | number[], maxColors: number): QuantizationResult {
    if (pixels.length === 0) {
        return { palette: new Map(), indices: [] };
    }

    // 1. First pass: Separate solid colors from transparent pixels
    const uniqueSolidColors = new Set<number>();
    const colorToPixelIndices = new Map<number, number[]>(); // Tracks which image index corresponds to which color
    const indices = new Array<number>(pixels.length / 4).fill(0); // Pre-fill with transparent index 0
    let hasTransparency = false;

    // Pack RGB into a single 32-bit integer for fast set operations
    for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const a = pixels[i + 3];

        // For this implementation, a pixel is either transparent or solid based on a threshold (e.g., A < 128)
        // because an indexed 8-bit palette only supports fully transparent or opaque colors.
        if (a < 128) {
            hasTransparency = true;
            // Index is already 0
            continue;
        }

        const packed = (r << 16) | (g << 8) | b;
        uniqueSolidColors.add(packed);

        const pixelIndex = i / 4;
        let pIndices = colorToPixelIndices.get(packed);
        if (!pIndices) {
            pIndices = [];
            colorToPixelIndices.set(packed, pIndices);
        }
        pIndices.push(pixelIndex);
    }

    const palette = new Map<number, string>();
    let nextPaletteIndex = 0;

    if (hasTransparency) {
        palette.set(nextPaletteIndex++, "#00000000"); // Standard PixelMCP transparent value
    }

    const availableColorsForSolid = maxColors - nextPaletteIndex;
    if (availableColorsForSolid <= 0) {
        // Technically an error state if maxColors is 1 and image has transparency plus solid colors,
        // but we'll fulfill the contract by just rendering everything remaining transparent
        return { palette, indices };
    }

    // 2. Exact match check
    // If the image already has fewer distinct solid colors than the available slots, map them exactly.
    if (uniqueSolidColors.size <= availableColorsForSolid) {
        for (const packed of uniqueSolidColors) {
            const index = nextPaletteIndex++;
            const r = (packed >> 16) & 255;
            const g = (packed >> 8) & 255;
            const b = packed & 255;
            const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}ff`;
            palette.set(index, hex);

            // Directly map the pixel indices
            const pIndices = colorToPixelIndices.get(packed)!;
            for (const pi of pIndices) {
                indices[pi] = index;
            }
        }
        return { palette, indices };
    }

    // 3. Median Cut Algorithm (if colors exceed slots)
    // Convert Set back to an array of unpack objects for sorting
    const colors: Array<{ r: number, g: number, b: number, packed: number }> = [];
    for (const packed of uniqueSolidColors) {
        colors.push({
            r: (packed >> 16) & 255,
            g: (packed >> 8) & 255,
            b: packed & 255,
            packed
        });
    }

    // A bucket contains a slice of the colors array
    let buckets: Array<Array<{ r: number, g: number, b: number, packed: number }>> = [colors];

    while (buckets.length < availableColorsForSolid) {
        // Find the bucket with the largest range in any color channel
        let maxRange = -1;
        let largestBucketIndex = -1;
        let channelToSortBy: 'r' | 'g' | 'b' = 'r';

        for (let i = 0; i < buckets.length; i++) {
            const bucket = buckets[i];
            if (bucket.length <= 1) continue; // Can't divide a bucket of 1 color

            let minR = 255, maxR = 0;
            let minG = 255, maxG = 0;
            let minB = 255, maxB = 0;

            for (const c of bucket) {
                if (c.r < minR) minR = c.r; if (c.r > maxR) maxR = c.r;
                if (c.g < minG) minG = c.g; if (c.g > maxG) maxG = c.g;
                if (c.b < minB) minB = c.b; if (c.b > maxB) maxB = c.b;
            }

            const rangeR = maxR - minR;
            const rangeG = maxG - minG;
            const rangeB = maxB - minB;

            const rMax = Math.max(rangeR, rangeG, rangeB);
            if (rMax > maxRange) {
                maxRange = rMax;
                largestBucketIndex = i;
                if (rangeR >= rangeG && rangeR >= rangeB) channelToSortBy = 'r';
                else if (rangeG >= rangeR && rangeG >= rangeB) channelToSortBy = 'g';
                else channelToSortBy = 'b';
            }
        }

        // If no bucket can be divided further, stop
        if (largestBucketIndex === -1) break;

        // Split the chosen bucket
        const bucketToSplit = buckets.splice(largestBucketIndex, 1)[0];

        // Sort by the channel with the largest range
        bucketToSplit.sort((a, b) => a[channelToSortBy] - b[channelToSortBy]);

        // Cut at the median
        const medianIndex = Math.floor(bucketToSplit.length / 2);
        buckets.push(bucketToSplit.slice(0, medianIndex));
        buckets.push(bucketToSplit.slice(medianIndex));
    }

    // 4. Generate the final palette from the average of each bucket
    const flatPalette: Array<{ r: number, g: number, b: number, i: number }> = [];

    for (const bucket of buckets) {
        if (bucket.length === 0) continue;

        let sumR = 0, sumG = 0, sumB = 0;
        for (const c of bucket) {
            sumR += c.r;
            sumG += c.g;
            sumB += c.b;
        }

        const avgR = Math.round(sumR / bucket.length);
        const avgG = Math.round(sumG / bucket.length);
        const avgB = Math.round(sumB / bucket.length);

        const index = nextPaletteIndex++;
        const hex = `#${avgR.toString(16).padStart(2, '0')}${avgG.toString(16).padStart(2, '0')}${avgB.toString(16).padStart(2, '0')}ff`;
        palette.set(index, hex);

        flatPalette.push({ r: avgR, g: avgG, b: avgB, i: index });
    }

    // 5. Map nearest neighbor
    // For every unique color, find which bucket average it is closest to and map those indices.
    for (const color of uniqueSolidColors) {
        const cr = (color >> 16) & 255;
        const cg = (color >> 8) & 255;
        const cb = color & 255;

        let closestDist = Infinity;
        let closestIndex = -1;

        for (const palC of flatPalette) {
            const dist = (cr - palC.r) ** 2 + (cg - palC.g) ** 2 + (cb - palC.b) ** 2;
            if (dist < closestDist) {
                closestDist = dist;
                closestIndex = palC.i;
            }
        }

        const pIndices = colorToPixelIndices.get(color)!;
        for (const pi of pIndices) {
            indices[pi] = closestIndex;
        }
    }

    return { palette, indices };
}
