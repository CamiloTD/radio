import { Config } from "../types";
import { encrypt, decrypt } from "./aes";

export function generateKeyFile (config: Config, key: string) {
    return encrypt(JSON.stringify(config), key);
}

export function readKeyFile (data: Buffer, channel: string) {
    return JSON.parse(decrypt(data, channel).toString());
}