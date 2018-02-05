import * as Path from 'path'

// Matches scheme (ie: tel:, mailto:, data:)
const SCHEME_REGEXP = /^[a-z]*\:/i;
export default function isUrl(url: string) {
  return !Path.isAbsolute(url) && SCHEME_REGEXP.test(url)
}