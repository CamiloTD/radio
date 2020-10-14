import fs from "fs";

import path from "path";

import { prompt } from "inquirer";

import { Config } from "../types";

import { encrypt, decrypt } from "./aes";

export function generateKeyFile (config: Config, key: string) {
    return encrypt(JSON.stringify(config), key);
}

export function readKeyFile (data: Buffer, channel: string) {
    return JSON.parse(decrypt(data, channel).toString());
}

export async function resolveConfig (opts): Promise<Config> {
    if(!opts.key) throw ("No keyfile received, Usage: zk -k secret.key <message>");
    var { password } = opts.pass? { password: opts.pass } : await prompt([{
        type: "password",
        name: "password",
        message: "Key pass.",
        mask: true
    }]);

    opts.pass = password;

    const config: Config = readKeyFile(fs.readFileSync(path.join(process.cwd(), opts.key)), password || "default");
    // config.NUMBER_OF_FRACTIONS = 1_048_576;
    
    // fs.writeFileSync("./secret2.key", generateKeyFile(config, password || "default"))
    return config;
}