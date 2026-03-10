/**
 * Generates the contents of a Godot 4.x .png.import sidecar file.
 * This configures the texture for pixel art (no lossy compression, no mipmaps, no filter).
 *
 * @param pngPath The relative string path of the PNG file to embed in 'source_file'
 * @param resourceType The type of resource, defaults to "CompressedTexture2D"
 * @returns The expected string content of the corresponding .import file
 */
export function generateGodotImportSidecar(
  pngPath: string,
  resourceType: string = 'CompressedTexture2D',
): string {
  return `[remap]

importer="texture"
type="${resourceType}"

[deps]

source_file="res://${pngPath}"
dest_files=["res://.godot/imported/${pngPath}-placeholder.ctex"]

[params]

compress/mode=0
mipmaps/generate=false
roughness/mode=0
`;
}
