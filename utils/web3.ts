import { log, highlight } from "termx";
import Web3 from "web3";
import { ERC20Stego } from "../layers/stego";
import HDWalletProvider from "@truffle/hdwallet-provider";
import { Account } from "./types";
const ERC_20_ABI = require('../erc20.json');

const ERC20NamesCache: { [key: string]: string } = {};

export async function getERC20Name (env: ERC20Stego, erc20: string) {
    if(ERC20NamesCache[erc20]) return ERC20NamesCache[erc20];

    const contract = new env.web3.eth.Contract(ERC_20_ABI, erc20);
    return ERC20NamesCache[erc20] = await contract.methods.symbol().call();
}

export async function getTokenBalance (env: ERC20Stego, erc20: string, address: string) {
    const contract = new env.web3.eth.Contract(ERC_20_ABI, erc20);

    return +(await contract.methods.balanceOf(address).call()) || 0;
}
export async function getEthBalance (env: ERC20Stego, address: string) {
    return +Web3.utils.fromWei(await env.web3.eth.getBalance(address)) || 0;
}

export async function sendEthBalance (stego: ERC20Stego, account: Account, to: string, value: number): Promise<string> {
    const wei = Web3.utils.toWei(value.toString(), 'ether');
    const web3 = new Web3(new HDWalletProvider({
        privateKeys: [account.pkey],
        providerOrUrl: stego.provider
    }))

    const event = web3.eth.sendTransaction({
        from: account.address,
        to,
        value: wei
    });

    return new Promise((done, error) => {
        event.catch(error);
        let txId = "";
        event.once('transactionHash', tx => txId = tx)
        event.once('confirmation', hash => done(txId))
        event.once('error', error)
    });
}

export function sendTokenBalance (stego: ERC20Stego, account: Account, to: string, erc20: string, value: number): Promise<string> {
    const web3 = new Web3(new HDWalletProvider({
        privateKeys: [account.pkey],
        providerOrUrl: stego.provider
    }))
    const contract = new web3.eth.Contract(ERC_20_ABI, erc20);

    const event = contract.methods.transfer(to, value).send({ from: account.address });

    return new Promise((done, error) => {
        event.catch(error);
        let txId = "";
        event.once('transactionHash', tx => {
            txId = tx
        })
        event.once('confirmation', hash => done(txId))
        event.once('error', error)
    });
}
