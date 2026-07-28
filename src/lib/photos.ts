import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

// ---------------------------------------------------------------------------
// Bottle photos.
//
// Images are downscaled and re-compressed BEFORE they are stored, so a 12 MP
// camera shot becomes a ~150 KB JPEG. That keeps the local store small, keeps
// sync uploads under the bucket's 5 MB limit, and stops the wardrobe grid
// stuttering on a collection of fifty full-resolution photos.
//
// Photos stay on-device unless the user is a syncing Premium subscriber, and
// the storage bucket is private with per-user path rules either way.
// ---------------------------------------------------------------------------

/** Long edge, in pixels. Comfortably sharp for a 2x tile and a detail view. */
export const MAX_DIMENSION = 1200;
export const JPEG_QUALITY = 0.78;

export type PickResult =
  | { ok: true; uri: string }
  | { ok: false; reason: 'cancelled' | 'permission' | 'error'; message?: string };

async function process(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_DIMENSION } }],
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

export async function pickFromLibrary(): Promise<PickResult> {
  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return { ok: false, reason: 'permission' };

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 5],
      quality: 1,
    });
    if (picked.canceled || !picked.assets?.[0]) return { ok: false, reason: 'cancelled' };

    return { ok: true, uri: await process(picked.assets[0].uri) };
  } catch (e) {
    return { ok: false, reason: 'error', message: e instanceof Error ? e.message : undefined };
  }
}

export async function takePhoto(): Promise<PickResult> {
  try {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { ok: false, reason: 'permission' };

    const picked = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 5],
      quality: 1,
    });
    if (picked.canceled || !picked.assets?.[0]) return { ok: false, reason: 'cancelled' };

    return { ok: true, uri: await process(picked.assets[0].uri) };
  } catch (e) {
    return { ok: false, reason: 'error', message: e instanceof Error ? e.message : undefined };
  }
}

/** User-facing message for a failed pick. `cancelled` deliberately returns null —
 *  backing out of the picker is not an error and must not raise an alert. */
export function pickErrorMessage(result: Extract<PickResult, { ok: false }>): string | null {
  switch (result.reason) {
    case 'cancelled':
      return null;
    case 'permission':
      return 'ScentKeep needs photo access to add a bottle picture. You can grant it in Settings.';
    default:
      return 'That image could not be added. Try another one.';
  }
}
