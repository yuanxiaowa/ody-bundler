import { Options } from "./structs/index";

export default class Logger {
  constructor(options: Options) { }
  clear() { }
  status(icon: string, text: string, color?: string) {
    console.log(`【${new Date().toLocaleTimeString()}】`, text)
  }
  error(text: any) {
    console.error(text)
  }
  log(msg: string) {
    console.log(msg)
  }
}