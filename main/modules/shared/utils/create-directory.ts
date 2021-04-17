import * as fs from 'fs';

export function createDirectory(path: string): Promise<string> {
  const dirReader: Promise<string> = new Promise((resolve, reject) => {
    fs.mkdir(path, (err: Error) => {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        resolve('success');
      }
    });
  });

  return dirReader;
}
