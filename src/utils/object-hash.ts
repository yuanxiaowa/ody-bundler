import * as crypto from 'crypto'

export default function objectHash(obj: any) {
  var hash = crypto.createHash('md5');
  for (let key of Object.keys(obj).sort()) {
    hash.update(key + obj[key]);
  }

  return hash.digest('hex');
}