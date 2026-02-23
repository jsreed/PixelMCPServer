export interface CompositeLayer {
    id: number;
    type: 'image' | 'tilemap' | 'shape' | 'group';
    visible: boolean;
    opacity: number;  // 0–255
    children?: CompositeLayer[];
    getPixel: (x: number, y: number, frame: number) => number | null;
}

export interface PaletteEntry {
    r: number;
    g: number;
    b: number;
    a: number;  // 0–255
}

/**
 * Flattens visible layers into a single RGBA output buffer using alpha-over compositing.
 *
 * @param width Canvas width in pixels.
 * @param height Canvas height in pixels.
 * @param layers The layer tree (ordered bottom-to-top).
 * @param palette Maps palette index → RGBA color.
 * @param frameIndex Which frame to render.
 * @returns A flat Uint8Array of width × height × 4 (RGBA).
 */
export function compositeFrame(
    width: number,
    height: number,
    layers: CompositeLayer[],
    palette: Map<number, PaletteEntry>,
    frameIndex: number
): Uint8Array {
    const buffer = new Uint8Array(width * height * 4); // Initialized to 0 (transparent)

    // Flatten the layer tree into a bottom-to-top ordered list,
    // respecting group visibility.
    const flatLayers: CompositeLayer[] = [];
    const flattenTree = (nodes: CompositeLayer[], parentVisible: boolean) => {
        for (const layer of nodes) {
            const effectiveVisible = parentVisible && layer.visible;

            if (layer.type === 'group') {
                // Groups produce no pixels, but propagate visibility to children
                if (layer.children) {
                    flattenTree(layer.children, effectiveVisible);
                }
            } else if (layer.type === 'image' || layer.type === 'tilemap') {
                if (effectiveVisible) {
                    flatLayers.push(layer);
                }
            }
            // 'shape' layers are non-rendered — skip entirely
        }
    };
    flattenTree(layers, true);

    // Composite each visible layer onto the buffer
    for (const layer of flatLayers) {
        const layerOpacity = layer.opacity;
        if (layerOpacity === 0) continue;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const paletteIndex = layer.getPixel(x, y, frameIndex);
                if (paletteIndex === null || paletteIndex === undefined) continue;

                const color = palette.get(paletteIndex);
                if (!color || color.a === 0) continue;

                // Apply layer opacity to the source alpha
                const srcA = Math.round((color.a * layerOpacity) / 255);
                if (srcA === 0) continue;

                const srcR = color.r;
                const srcG = color.g;
                const srcB = color.b;

                const idx = (y * width + x) * 4;
                const dstR = buffer[idx];
                const dstG = buffer[idx + 1];
                const dstB = buffer[idx + 2];
                const dstA = buffer[idx + 3];

                if (dstA === 0) {
                    // Fast path: destination is fully transparent
                    buffer[idx] = srcR;
                    buffer[idx + 1] = srcG;
                    buffer[idx + 2] = srcB;
                    buffer[idx + 3] = srcA;
                } else {
                    // Standard alpha-over compositing
                    // outA = srcA + dstA * (1 - srcA/255)
                    const srcANorm = srcA / 255;
                    const outA = srcA + dstA * (1 - srcANorm);

                    if (outA === 0) continue;

                    buffer[idx] = Math.round((srcR * srcA + dstR * dstA * (1 - srcANorm)) / outA);
                    buffer[idx + 1] = Math.round((srcG * srcA + dstG * dstA * (1 - srcANorm)) / outA);
                    buffer[idx + 2] = Math.round((srcB * srcA + dstB * dstA * (1 - srcANorm)) / outA);
                    buffer[idx + 3] = Math.round(outA);
                }
            }
        }
    }

    return buffer;
}
