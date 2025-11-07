/**
 * Download utilities
 */

import * as https from 'https';
import * as fs from 'fs';

/**
 * Downloads a file from URL
 *
 * @param url - URL to download from
 * @param dest - Destination file path
 */
export async function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    https
      .get(url, response => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Handle redirect
          if (response.headers.location) {
            file.close();
            fs.unlinkSync(dest);
            download(response.headers.location, dest).then(resolve).catch(reject);
            return;
          }
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      })
      .on('error', error => {
        fs.unlinkSync(dest);
        reject(error);
      });
  });
}

