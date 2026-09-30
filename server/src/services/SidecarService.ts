import fs from 'node:fs';
import path from 'node:path';
import type { SidecarFile, SidecarPhoto, EditDAG } from '../../../shared/types.js';

export class SidecarService {
  public static getSidecarPath(folderPath: string): string {
    return path.join(folderPath, '.paloma.json');
  }

  public static readSidecar(folderPath: string): SidecarFile | null {
    const sidecarPath = this.getSidecarPath(folderPath);
    if (!fs.existsSync(sidecarPath)) return null;

    try {
      const content = fs.readFileSync(sidecarPath, 'utf-8');
      return JSON.parse(content) as SidecarFile;
    } catch {
      return null;
    }
  }

  public static writeSidecar(folderPath: string, folderName: string, photosData: Record<string, SidecarPhoto>): void {
    const sidecarPath = this.getSidecarPath(folderPath);
    const sidecar: SidecarFile = {
      version: '1.0',
      folder_name: folderName,
      photos: photosData,
    };

    fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2), 'utf-8');
  }

  public static updatePhotoSidecar(
    folderPath: string,
    folderName: string,
    filename: string,
    update: Partial<SidecarPhoto>
  ): void {
    const existing = this.readSidecar(folderPath) || {
      version: '1.0',
      folder_name: folderName,
      photos: {},
    };

    const currentPhoto = existing.photos[filename] || {};
    existing.photos[filename] = {
      ...currentPhoto,
      ...update,
    };

    this.writeSidecar(folderPath, folderName, existing.photos);
  }
}
