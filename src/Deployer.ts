import * as request from 'request-promise-native'
import { writeFile, ensureDir } from 'fs-extra';
import { join, dirname } from 'path';
export function sendToNetwork(url: string, path: string, content: any) {
  return request.post(url, {
    formData: {
      [path]: content
    }
  })
}

export async function sendToLocal(dir: string, path: string, content: any) {
  var filename = join(dir, path)
  await ensureDir(dirname(filename))
  return writeFile(filename, content)
}
