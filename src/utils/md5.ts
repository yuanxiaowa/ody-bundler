import * as crypto from 'crypto'
export default function md5(text: string | Buffer) {
  return crypto.createHash('md5')
    .update(text)
    .digest('hex')
}