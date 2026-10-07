import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// Phones: write the file to the cache and open the share sheet, to save it or send it on
export const saveCsv = async (fileName: string, csv: string) => {
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(csv);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing files is not available on this device');
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: 'Save or send your statement',
  });
};
