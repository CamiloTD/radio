import { VERBOSE } from "../config";

export const debug = (...data: any[]) => VERBOSE && console.log(...data);