import Web3 from "web3";
import { Environment } from "./environment";
import HDWalletProvider from "@truffle/hdwallet-provider";
import { CHANNEL, ETH_PRIVATE_KEY, NUMBER_OF_ACCOUNTS, NUMBER_OF_FRACTIONS, WEB3_PROVIDER } from "./config";
import { prepareForOperations } from "./erc20gen";

async function init () {
    const web3 = new Web3(new HDWalletProvider({
        privateKeys: [ETH_PRIVATE_KEY],
        providerOrUrl: WEB3_PROVIDER,
        numberOfAddresses: NUMBER_OF_ACCOUNTS
    }));

    const accounts = require("./accounts.json")
 

    // const web3Accounts = web3.eth.accounts.wallet.create(NUMBER_OF_ACCOUNTS);
    // console.log(Object.keys(web3Accounts).filter(acc => web3Accounts[acc].address === acc).map(acc => ({ pkey: web3Accounts[acc].privateKey, address: web3Accounts[acc].address.toLowerCase() })))
    const env = new Environment(web3, accounts, NUMBER_OF_FRACTIONS, ["0x69c4cfd38fb6e4b6a9b8615c81a604b615c8d6cf", "0x6e604dc1d121038cbcb1bf5019fec561c07a9ad5"], CHANNEL);
    const operations = env.getOperationsFor("Hello World! How are you?");

    await prepareForOperations(env, operations);
    // const results = env.getDataFromOperations(operations);
    
    // console.log(operations)
    // console.log(results)
}

init().catch(console.log)