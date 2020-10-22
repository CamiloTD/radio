import fs from "fs";

import path from "path";

import { prompt } from "inquirer";

import { Config, PublicConfig } from "./types";

import { encrypt, decrypt } from "./aes";
import { hideInImageURL, reveal } from "../layers/stego/image";
import { ERC20Stego } from "../layers/stego";

export async function generateKeyFile (config: Config, key: string) {
    return await hideInImageURL(encrypt(JSON.stringify(config), key));
}

export function readKeyFile (data: Buffer, channel: string) {
    return JSON.parse(decrypt(data, channel).toString());
}

export async function resolveConfig (opts): Promise<Config> {
    if(!opts.key) throw ("No keyfile received, Usage: radio -k name <message>");
    var { password } = opts.pass? { password: opts.pass } : await prompt([{
        type: "password",
        name: "password",
        message: "Key pass for " + opts.key + ".png.",
        mask: true
    }]);

    opts.pass = password;
    opts.keypath = path.resolve(
        __dirname,
        "../wallets/" + opts.key + ".png"
    );

    const config: Config = readKeyFile(
        reveal(
            fs.readFileSync(
                path.resolve(
                    __dirname,
                    "../wallets/" + opts.key + ".png"
                )
            )
        ), password || "default");
    // config.NUMBER_OF_FRACTIONS = 1_048_576;
    
    // fs.writeFileSync("./secret2.key", generateKeyFile(config, password || "default"))
    return config;
}

export async function saveConfig (config: Config, name: string, pass: string) {
    const stego = new ERC20Stego(config);
    const pkey = await generateKeyFile(config, pass || "default");
    const pubKey = stego.publicKey();

    fs.writeFileSync(path.resolve(__dirname, `../wallets/${name}.png`), pkey)
    fs.writeFileSync(path.resolve(__dirname, `../wallets/public/${name}.png`), await hideInImageURL(pubKey))
}

export function generatePublicConfig (config: Config): PublicConfig {
    return {
        ACCOUNTS: config.ACCOUNTS.map(acc => acc.address),
        ERC20_TOKENS: config.ERC20_TOKENS,
        CHANNEL: config.CHANNEL,
        MINIMUM_ETH: config.MINIMUM_ETH,
        NUMBER_OF_FRACTIONS: config.NUMBER_OF_FRACTIONS,
        MAX_SPACING: config.MAX_SPACING,
        WEB3_PROVIDER: config.WEB3_PROVIDER
    };
}