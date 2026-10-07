import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

// Profile pictures are shown small, so upload a square-ish 512px JPEG of a few dozen KB
const SIZE = 512;

/** Let the user pick a photo and crop it square; resolves to base64 JPEG, or null if they cancel */
export const pickProfilePhoto = async (): Promise<string | null> => {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (picked.canceled || !picked.assets?.length) return null;

  const { uri, width, height } = picked.assets[0];
  const context = ImageManipulator.manipulate(uri);
  // Only shrink, along the shorter side
  if (Math.min(width, height) > SIZE) context.resize(width <= height ? { width: SIZE } : { height: SIZE });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  return saved.base64 ?? null;
};
