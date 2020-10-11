import Web3 from "web3";
import { log, highlight, cold, danger, warning } from "termx";
import HDWalletProvider from "@truffle/hdwallet-provider";
import { MAX_SPEND, MINIMUM_ETH, MINIMUM_TOKEN_SUPPLY, NUMBER_OF_FRACTIONS, WEB3_PROVIDER } from "./config";
import { Environment } from "./environment";
import { Operation, SendOperation } from "./types";
const ERC_20_ABI = require('./erc20.json');

export async function prepareForOperations (env: Environment, operations: Operation[]) {
    var tokenBalances = await balances(env);
    let i = 0;

    function nextOp () { for(let k=i;k<operations.length;k++) if(operations[k].type === "send") return operations[k]; }
    const getAddressWithEnoughCash = (erc20: string, cash: number) => {
        for (const address in tokenBalances) {
            if(tokenBalances[address][erc20] > cash) return address;
        }
    }

    for (var op of operations) {
        if (op.type === "wait") {
            const next = nextOp() as SendOperation;
            if(!next) break;

            const nextOpBalance = tokenBalances[next.from][next.erc20];
            const donor = getAddressWithEnoughCash(next.erc20, env.fractions);

            if(nextOpBalance < env.fractions) {
                if(!donor) throw new Error("Not enough " + next.erc20 + " in a single account to make the operation. Cash needed: " + env.fractions);

                // log(danger("Not enough tokens in"), next.from, highlight("Balance:"), nextOpBalance)

                op = <any>{
                    type: "send",
                    from: donor,
                    to: next.from,
                    erc20: next.erc20,
                    value: env.fractions
                }
            } else {
                op = <any>{
                    type: "send",
                    from: donor,
                    to: env.accounts[Math.floor(Math.random() * env.accounts.length)].address,
                    erc20: next.erc20,
                    value: (Math.floor(Math.random()) * env.fractions) || 1
                }
            }
        }

        if(op.type === "send") {
            const ethBalance = tokenBalances[op.from].eth;
                
            if(+ethBalance < MINIMUM_ETH) {
                const donor = getAddressWithEnoughCash("eth", MINIMUM_ETH * 2);

                if(!donor) throw new Error("Not enough eth in a single account to make the operation. Cash needed: " + env.fractions);

                log("Sending", MINIMUM_ETH * 2, "ETH from", donor, "to", highlight(op.from))
                
                const hash = await sendEthBalance(env, donor, op.from, MINIMUM_ETH * 2);

                tokenBalances[donor].eth = await getEthBalance(env, donor);
                tokenBalances[op.from].eth = await getEthBalance(env, op.from);

                log(highlight("Done:"), hash);
            }
            
            log("Sending", op.value, "tokens from", highlight(op.from), "to", highlight(op.to))
            
            const hash = await executeOperation(env, op);
                
            tokenBalances[op.from].eth = await getEthBalance(env, op.from);
            tokenBalances[op.to].eth = await getEthBalance(env, op.to);

            tokenBalances[op.from][op.erc20] = await balance(env, op.erc20, op.from);
            tokenBalances[op.to][op.erc20] = await balance(env, op.erc20, op.to);

            log(highlight("Done:"), hash);
        }

        i++;
    }
}

export function executeOperation (env: Environment, operation: SendOperation) {
    const account = env.account(operation.from);
    const web3 = new Web3(new HDWalletProvider({
        privateKeys: [account.pkey],
        providerOrUrl: WEB3_PROVIDER
    }))
    const contract = new web3.eth.Contract(ERC_20_ABI, operation.erc20);

    const event = contract.methods.transfer(operation.to, operation.value).send({ from: account.address });

    return new Promise((done, error) => {
        event.catch(error);
        event.once('confirmation', hash => done(hash))
    });
}

export async function balances (env: Environment) {
    const accountBalances: { [key: string]: { [key: string]: number } } = {};
    let totalSupply: { [key: string]: number } = {};

    await Promise.all(env.accounts.map(async account => {
        const erc20s = env.erc20;
        const accountData: { [key: string]: number } = {
            eth: await getEthBalance(env, account.address)
        };

        for (const erc of erc20s)
            accountData[erc] = await balance(env, erc, account.address);

        for (const erc in accountData) totalSupply[erc] = (totalSupply[erc] || 0) + accountData[erc];

        accountBalances[account.address] = accountData;
    }));

    if(totalSupply.eth < MINIMUM_ETH) log(warning("Warning: There is less than 1 ETH in total, please send more eth before the system stops working :). Total Eth:"), totalSupply.eth)
    for (const erc in totalSupply)
        if(erc !== "eth" && totalSupply[erc] < MINIMUM_TOKEN_SUPPLY)
            log(warning("Warning: There is less than " + MINIMUM_TOKEN_SUPPLY + " " + cold(erc) + " tokens in total, please send more tokens :). Total Tokens:"), totalSupply[erc])
    
    return accountBalances;
}

export async function balance (env: Environment, erc20: string, address: string) {
    const contract = new env.web3.eth.Contract(ERC_20_ABI, erc20);

    return +(await contract.methods.balanceOf(address).call()) || 0;
}

export async function getEthBalance (env: Environment, address: string) {
    return +Web3.utils.fromWei(await env.web3.eth.getBalance(address)) || 0;
}

export async function sendEthBalance (env: Environment, from: string, to: string, value: number) {
    const account = env.account(from);
    const wei = Web3.utils.toWei(value.toString(), 'ether');
    const web3 = new Web3(new HDWalletProvider({
        privateKeys: [account.pkey],
        providerOrUrl: WEB3_PROVIDER
    }))

    const event = web3.eth.sendTransaction({
        from,
        to,
        value: wei
    });

    return new Promise((done, error) => {
        event.catch(error);
        event.once('confirmation', hash => done(hash))
    });
}