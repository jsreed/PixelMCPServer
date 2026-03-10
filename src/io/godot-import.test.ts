import { describe, it, expect } from 'vitest';
import { generateGodotImportSidecar } from './godot-import.js';

describe('generateGodotImportSidecar', () => {
  it('generates a valid Godot 4 import file sidecar for pixel art textures', () => {
    const filename = 'character_strip.png';
    const output = generateGodotImportSidecar(filename);

    expect(output).toContain('[remap]');
    expect(output).toContain('importer="texture"');
    expect(output).toContain('type="CompressedTexture2D"');

    expect(output).toContain('[deps]');
    expect(output).toContain(`source_file="res://${filename}"`);
    expect(output).toContain(`dest_files=["res://.godot/imported/${filename}-placeholder.ctex"]`);

    expect(output).toContain('[params]');
    expect(output).toContain('compress/mode=0');
    expect(output).toContain('mipmaps/generate=false');
    expect(output).toContain('roughness/mode=0');
  });

  it('allows overriding the resource type', () => {
    const filename = 'tileset.png';
    const output = generateGodotImportSidecar(filename, 'Texture2D');

    expect(output).toContain('type="Texture2D"');
  });
});
