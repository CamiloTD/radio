import Web3 from "web3";
import { ERC20Stego } from "./layers/stego";
import HDWalletProvider from "@truffle/hdwallet-provider";
import { CHANNEL, WEB3_PROVIDER } from "./config";

async function init () {
    // const stego = new ERC20Stego(web3, accounts, NUMBER_OF_FRACTIONS, ["0x69c4cfd38fb6e4b6a9b8615c81a604b615c8d6cf", "0x6e604dc1d121038cbcb1bf5019fec561c07a9ad5"], CHANNEL);
 
    // await initAPI(stego);
    // const web3Accounts = web3.eth.accounts.wallet.create(NUMBER_OF_ACCOUNTS);
    // console.log(Object.keys(web3Accounts).filter(acc => web3Accounts[acc].address === acc).map(acc => ({ pkey: web3Accounts[acc].privateKey, address: web3Accounts[acc].address.toLowerCase() })))
    // const operations = env.hide(Buffer.from("Hello World! How are you?"));
    // operations.debug()
    // const results = await env.revealFromTx("0x297e7ad231070deb723e6ce3695e90d5d538a3431917673ebaa45aa126e767d6");
    // await prepareForOperations(env, operations);
    // console.log("Results --->", results.toString())
    // 0x297e7ad231070deb723e6ce3695e90d5d538a3431917673ebaa45aa126e767d6
}

init().catch(console.log)
process.on('uncaughtException', console.log)