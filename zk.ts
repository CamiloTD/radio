import Web3 from "web3";

import { log, cold, danger, highlight, warning } from "termx";

import { program } from "commander";

import { prompt } from "inquirer";

import fs from "fs";

import path from "path";

import { Config, CONTENT_TYPE_NAME, TYPE_CALL, TYPE_FILEHASH, TYPE_RAW, TYPE_REDISCMD, TYPE_TEXT } from "./types";

import { IPFStorage } from "./layers/ipfs";
import { RedisStorage } from "./layers/redis";
import { ERC20Stego } from "./layers/stego";
import { encrypt } from "./utils/aes";
import { generateKeyFile, readKeyFile, resolveConfig } from "./utils/keyfile";
import { getERC20Name, getEthBalance, getTokenBalance } from "./utils/web3";

program.version("0.0.1");

const Commands = {

    async upload (opts, file: string) {
        const config = await resolveConfig(opts)
        const stego = new ERC20Stego(config);
        const ipfs = new IPFStorage(stego, config.PINATA_KEY, config.PINATA_SECRET)
        const txIds = await ipfs.uploadFile(path.resolve(process.cwd(), file));

        log(cold("Tx:"), txIds[0])
    },

    async read (opts, type: string, txId: string) {
        const config = await resolveConfig(opts)
        const stego = new ERC20Stego(config);

        const typeName = CONTENT_TYPE_NAME.indexOf(type);

        if(typeName < 0) throw "Type " + type + " does not exists in the type index, possible values are: " + CONTENT_TYPE_NAME.join(", ");
        
        const log = await stego.getTransactionHistory(txId, typeName);
        console.log(log);
        
        //console.log((await stego.revealFromTx(txId)).toString())
    },

    async db (opts, txId: string) {
        const config = await resolveConfig(opts)
        const stego = new ERC20Stego(config);
        const redis = new RedisStorage(stego, txId);

        console.log(await redis.init());

    },

    async write (opts, type: string, data: string) {
        const config = await resolveConfig(opts);
        const stego = new ERC20Stego(config);

        const typeName = CONTENT_TYPE_NAME.indexOf(type);

        if(typeName < 0) throw "Type " + type + " does not exists in the type index, possible values are: " + CONTENT_TYPE_NAME.join(", ");

        const ex = stego.hide(Buffer.from(data), typeName)
        const txIds = await ex.execute();

        console.log("Tx:", cold(txIds[0]));
        process.exit(0)
    },

    async liquidity (opts) {
        const config = await resolveConfig(opts);
        const stego = new ERC20Stego(config);
        const total: any = {};
        
        let i=0;
        
        for (const account of stego.accounts) {
            const { address } = account;
            const tokens = { eth: await getEthBalance(stego, address) };
            
            for (const erc20 of stego.erc20)
                tokens[await getERC20Name(stego, erc20)] = await getTokenBalance(stego, erc20, address);
            
            for (let i in tokens) {
                total[i] = (total[i] || 0) + tokens[i];
            }
            
            log(highlight(`(${++i}/${stego.accounts.length})`), cold(address), ":", Object.keys(tokens).map((name) => `${tokens[name]} ${warning(name)}`).join(", "))
        }

        log(highlight(`Total:`), Object.keys(total).map((name) => `${total[name]} ${warning(name)}`).join(", "))
    },

    async keygen (opts, filename: string) {
        log(cold("Generating ZK keyfile..."))

        if(!filename) return log(danger("No filename received, Usage:"), "zk keygen <secret.key>")
        filename = path.resolve(process.cwd(), filename)
        {//? Prompt
            var input = await prompt([
                {
                    type: "number",
                    name: "accounts",
                    message: "How many accounts do you want to generate?",
                    default: 64
                },
                {
                    type: "text",
                    name: "provider",
                    message: "Enter your RPC provider",
                    default: "https://rinkeby.infura.io/v3/c2b9752a34214f55ac142a152c281dfd" //! REMOVE THIS DEFAULT
                },
                {
                    type: "input",
                    name: "erc20",
                    message: "Enter your ERC20 addresses separated by comma",
                    default: "0x69c4cfd38fb6e4b6a9b8615c81a604b615c8d6cf,0x6e604dc1d121038cbcb1bf5019fec561c07a9ad5"
                },
                {
                    type: "number",
                    name: "fractions",
                    message: "Maximum amount of tokens sent in 1 transaction?",
                    default: 65536
                },
                {
                    type: "number",
                    name: "spacing",
                    message: "Maximum number of dummy transactions between 2 info transactions",
                    default: 3
                },
                {
                    type: "number",
                    name: "minimum_eth",
                    message: "Minimum amount of eth needed to send a transaction",
                    default: 0.01
                },
                {
                    type: "password",
                    name: "password",
                    message: "Enter a secure password for this channel.",
                    mask: true
                }
            ]);

            var channel = encrypt(Math.random().toString(), Math.random() + ":" + Date.now()).toString('base64');
        }

        {//? Account Generation
            var web3 = new Web3(new Web3.providers.HttpProvider(input.provider));
            var web3Accounts = web3.eth.accounts.wallet.create(input.accounts);
            var accounts = Object.keys(web3Accounts).filter(acc => web3Accounts[acc].address === acc).map(acc => ({ pkey: web3Accounts[acc].privateKey, address: web3Accounts[acc].address.toLowerCase() }));
        }

        const config: Config = {
            ACCOUNTS: accounts,
            CHANNEL: channel,
            ERC20_TOKENS: input.erc20.split(",").map(x => x.trim()),
            MAX_SPACING: input.spacing,
            MINIMUM_ETH: input.minimum_eth,
            NUMBER_OF_FRACTIONS: input.fractions,
            WEB3_PROVIDER: input.provider,
            VERBOSE: false
        }

        fs.writeFileSync(filename, generateKeyFile(config, input.password || "default"))
    },

    async config (opts, key: string, val: string) {
        const config = await resolveConfig(opts);
        if(val === undefined) return log(cold(key + ":"), config[key]);

        fs.writeFileSync(path.join(process.cwd(), opts.key) + ".backup", generateKeyFile(config, opts.pass || "default"))

        config[key] = val;
        
        fs.writeFileSync(path.join(process.cwd(), opts.key), generateKeyFile(config, opts.pass || "default"))
        log("Key", highlight(key), "set to", cold(val));
    }

}

program.option("-p, --pass <pass>", "File password")
program.option("-k --key <key>", "Keyfile")
const data = program.parse(process.argv);

Commands[data.args[0]] && Commands[data.args[0]](program, ...data.args.slice(1)).catch(console.log)