import Web3 from "web3";
import { box, button, list, screen, terminal } from "blessed";

import { log, cold, danger, highlight, warning } from "termx";
import Chalk from "chalk";
import repl from "repl";

import { program } from "commander";

import { prompt } from "inquirer";

import fs from "fs";

import path from "path";

import { Config, CONTENT_TYPE_NAME, TYPE_CALL, TYPE_FILEHASH, TYPE_RAW, TYPE_REDISCMD, TYPE_TEXT } from "./utils/types";
import $imageToAscii from "image-to-ascii";

import { IPFStorage } from "./layers/ipfs";
import { RedisStorage } from "./layers/redis";
import { ERC20Stego } from "./layers/stego";
import { encrypt } from "./utils/aes";
import { generateKeyFile, readKeyFile, resolveConfig, saveConfig } from "./utils/keyfile";
import { getERC20Name, getEthBalance, getTokenBalance, sendEthBalance, sendTokenBalance } from "./utils/web3";
import { hideInImageURL } from "./layers/stego/image";
import util from "util"
const imageToAscii = util.promisify($imageToAscii)
program.version("0.0.1");

{//? @note REGEX
    var REGEX_ASSIGNMENT = /^\$\.([^(]+)=(.+)$/;
    var REGEX_VALUE = /^(\$\.[^(=]+)$/;
    var REGEX_IS_BLOCKCHAIN_ADDRESS = /^([^@]+)@0x/;
    var REGEX_IS_ENS_ADDRESS = /^(.+)\.eth$/i;
}

// 0x44a0b9045984ff736c1b1b66d8625657fd960aea4e00013b4c45a6ee09ffefe0

const Commands = {

    async upload (opts, file: string) {
        const config = await resolveConfig(opts)
        const stego = new ERC20Stego(config);
        const ipfs = new IPFStorage(stego, config.PINATA_KEY, config.PINATA_SECRET)
        const txIds = await ipfs.uploadFile(path.resolve(process.cwd(), file));

        log(cold("Tx:"), txIds[0])
    },

    async deploy (opts, file) {
        const config = await resolveConfig(opts)
        const stego = new ERC20Stego(config);
        const ipfs = new IPFStorage(stego, config.PINATA_KEY, config.PINATA_SECRET)
        const txIds = await ipfs.uploadFile(path.resolve(process.cwd(), file));

        const ex = await stego.hide(Buffer.from([0]), TYPE_CALL);
        await ex.execute();
        log();
        log(cold("Contract Tx:"), txIds[0])
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

    async keygen (opts, name: string) {
        log(cold("Generating keyfile..."))

        if(!name) return log(danger("No filename received, Usage:"), "radio keygen <storage-name>")
        {//? Prompt
            var input = await prompt([
                {
                    type: "number",
                    name: "accounts",
                    message: "How many accounts do you want to generate?",
                    default: 512
                },
                {
                    type: "text",
                    name: "provider",
                    message: "Enter your RPC provider",
                    default: "https://rinkeby.infura.io/v3/e9d97ec35bd14b89a2ca3eefa1df56b2" //! REMOVE THIS DEFAULT
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
                    default: 18446744073709552000
                },
                {
                    type: "number",
                    name: "spacing",
                    message: "Maximum number of dummy transactions between 2 info transactions",
                    default: 2
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

        await saveConfig(config, opts.key, input.password || "default");
    },

    async config (opts, key: string, val: string) {
        const config = await resolveConfig(opts);
        if(val === undefined) return log(cold(key + ":"), config[key]);

        fs.writeFileSync(path.resolve(__dirname, "./wallets/backup/" + opts.key + ".png"), await generateKeyFile(config, opts.pass || "default"))

        try { val = JSON.parse(val) } catch (exc) {}
        config[key] = val;
        
        await saveConfig(config, opts.key, opts.pass || "default");
        log("Key", highlight(key), "set to", val);
    },

    async transfer (opts, source, target, erc20, quantity) {
        const sourceConfig = await resolveConfig({ key: source });
        const targetConfig = await resolveConfig({ key: target });

        const sourceStego = new ERC20Stego(sourceConfig);
        const targetStego = new ERC20Stego(targetConfig);

        const receiverAccount = targetStego.accounts[0]; //? TODO: Add Randomizer

        if(!+quantity || +quantity < 0) throw "Quantity must be a positive number.";
        
        if(erc20 === "eth") {
            const donor = await sourceStego.getAccountWithEnoughEth(+quantity);

            if(!donor) throw "Not enough funds in any source account";
            
            log(cold("Sending"), +quantity, cold("from"), highlight(donor), cold("to"), highlight(receiverAccount.address));
            await sendEthBalance(sourceStego, sourceStego.account(donor), receiverAccount.address, +quantity);            
        } else {
            const sourceERCNames = await Promise.all(sourceStego.erc20.map((name) => getERC20Name(sourceStego, name)));

            if (sourceERCNames.indexOf(erc20) < 0) return log(danger("Token"), warning(erc20), danger("not found in"), cold(source + ".png"), danger("keyfile. PossibleValues are:"), sourceERCNames.join(", "));
            const tokenAddress = sourceStego.erc20[sourceERCNames.indexOf(erc20)];
            const donor = await sourceStego.getAccountWithEnoughTokens(tokenAddress, +quantity);

            if(!donor) throw "Not enough " + erc20 + "funds in any source account";
            
            log(cold("Sending"), +quantity, warning(erc20), cold("from"), highlight(donor), cold("to"), highlight(receiverAccount.address));
            await sendTokenBalance(sourceStego, sourceStego.account(donor), receiverAccount.address, tokenAddress, +quantity);       
        }

        log(highlight("Done!"))
    },

    async contract (opts, txId: string) {
        const config = await resolveConfig(opts);
        const stego = new ERC20Stego(config);
        
        {//? @note (Connect) Define Variables
            var API = await stego.contract(txId);
            var help: any = {};
            var methods: any;
        }

        {//? @note (Connect) Connect and Fetch Methods
            log(cold(`Connecting to ${txId}...`));

            // methods = 
        }

        const r = repl.start({
            prompt: Chalk.hex("#82b6ed")(Chalk.bold(txId)) + highlight(' $ '),

            //? @note (Connect) On Command received
            eval: async (cmd, $, filename, cb) => {
                {//? @note (Connect.Eval) Preprocess command & OnHelp
                    cmd = cmd.trim();
                }

                try {//? @note (Connect.Eval) Main
                    
                    {//? @note (Connect.Eval) On Exit
                        if(cmd === "exit") process.exit(0);
                    }

                    {//? @note (Connect.Eval) On Help
                        if(cmd === "help") {
                            log("HELP!")
                            process.exit(0)
                        }
                    }

                    {//? @note (Connect.Eval) On Command
                        let rs = await eval('API.' + cmd);

                        cb(null, rs);
                    }
                } catch (exc) { //? @note (Connect.Eval) On Error
                    if(typeof exc === "object") {
                        if(exc.message) exc = exc.message;
                        else exc = JSON.stringify(exc);
                    }

                    log(danger(exc));
                    cb(null, undefined);
                }
            },

            completer: (line: string) => {
                // const hits = completions.filter((c: string) => c.includes(line));

                // return [hits.length ? hits : completions, line];
            }
        });

        // for(let i in store.data)
            // r.context[i] = store.data[i];
    },

    async station () {
        const keylist = fs.readdirSync("./wallets")
            .filter(name => name.endsWith(".png"))
            .map(name => name.substring(0, name.lastIndexOf(".png")));

        const { key } = await prompt([{
            type: "list",
            name: "key",
            message: "Select the key you want to use.",
            choices: keylist
        }]);

        const config = await resolveConfig({ key });

        console.log(config)
    }
}

program.option("-p, --pass <pass>", "File password")
program.option("-k --key <key>", "Keyfile")
const data = program.parse(process.argv);

Commands[data.args[0]] && Commands[data.args[0]](program, ...data.args.slice(1)).catch(console.log)