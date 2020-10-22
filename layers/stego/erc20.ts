import HDWalletProvider from "@truffle/hdwallet-provider";

import { log, warning, cold, highlight, danger } from "termx";

import Web3 from "web3";

import msgpack from "msgpack";
import SHA from "sha.js";

import { Contract } from "../contracts";
import { Account, Config, Operation, SendOperation, WaitOperation, CONTENT_TYPE, CONTENT_TYPE_NAME, TYPE_RAW, TYPE_REDISCMD, TYPE_TEXT, TYPE_FILEHASH, TYPE_CALL } from "../../utils/types";
import { checksum, encrypt } from "../../utils/aes";
import { rng } from "../../utils/random";
import { getERC20Name, getEthBalance, getTokenBalance, sendEthBalance, sendTokenBalance } from "../../utils/web3";

import { Stego } from ".";
import { generatePublicConfig } from "../../utils/keyfile";
const ERC_20_ABI = require('../../erc20.json');

const STATUS_OK = 0;
const STATUS_NO_GAS = 1;
const STATUS_NO_TOKEN = 2;
const balanceCache: { [addr: string]: { [erc: string]: number }} = {};

export class ERC20Stego extends Stego<ExecutionPlan> {

    web3: Web3;
    accounts: Account[];
    fractions: number;
    chan: string;
    erc20: string[]
    provider: string;

    accountsSpace: number;
    fractionsSpace: number;
    erc20Space: number;
    totalSpace: number;
    maxSpacing: number;
    minEth: number;
    id: string;

    constructor (config: Config) {
        super();
        this.web3 = new Web3(new Web3.providers.HttpProvider(config.WEB3_PROVIDER));
        this.accounts = config.ACCOUNTS;
        this.fractions = config.NUMBER_OF_FRACTIONS;
        this.erc20 = config.ERC20_TOKENS;
        this.chan = config.CHANNEL;
        this.maxSpacing = config.MAX_SPACING;
        this.minEth = config.MINIMUM_ETH;
        this.provider = config.WEB3_PROVIDER;

        this.accountsSpace  = Math.floor(Math.log2(this.accounts.length ** 2 - this.account.length));
        this.fractionsSpace = Math.floor(Math.log2(this.fractions));
        this.erc20Space     = Math.floor(Math.log2(this.erc20.length));

        this.totalSpace = this.accountsSpace + this.fractionsSpace + this.erc20Space;
        this.id = this.getID();

        log(cold("New ERC20Stego Created:"));
        log(cold("Account Combinations:"), this.accounts.length ** 2 - this.account.length, highlight(`(${this.accountsSpace} bits)`));
        log(cold("Fractions:"), this.fractions, highlight(`(${this.fractionsSpace} bits)`));
        log(cold("ERC-20s:"), this.erc20.length, highlight(`(${this.erc20Space} bits)`));
        log(cold("Total Space per Transaction:"), this.totalSpace, "bits");
        log(cold("ID:"), highlight(this.id));
    }

    getID () {
        const dataToHash = JSON.stringify([
            this.accounts,
            this.fractions,
            this.erc20,
            this.chan,
            this.maxSpacing,
            this.minEth,
            this.provider
        ]);
        return SHA('sha256').update(dataToHash).digest('hex');
    }

    account (address: string) {
        return this.accounts.find(acc => acc.address === address);
    }

    async contract (txId: string) {
        return await Contract(this, txId);
    }

    hide (data: Buffer, type: CONTENT_TYPE) {
        //? Slices the data in chunks
            var bufs = [];
            var buf = Buffer.from([type, ...data, ...checksum(data)]);
            var dataHeader = [buf.length & 0xFF];
            buf = Buffer.from([...dataHeader, ...buf])
            var spaceInBytes = Math.floor(this.totalSpace/8);

            for (let i=0;i<buf.length;i+=spaceInBytes) bufs.push(
                buf.slice(i, i + spaceInBytes)
            );
        
        //? Generate Random Seeds
            const txRng  = rng(this.chan, "tx");

        //? Results
            const ops = new ExecutionPlan(this, { type: "wait" })

            for (const buf of bufs) {
                const spacing = txRng.int(1, this.maxSpacing);
                const binary = [...buf].map(x => x.toString(2).padStart(8, "0")).join("").padEnd(this.totalSpace, "0"); //! TODO: MIX BEFORE PARSING TO BINARY, ENDING ZEROS COULD RESULT IN A RECOGNIZABLE WATERMARK
                const data = {
                    accounts: binary.substr(0, this.accountsSpace),
                    fractions: binary.substr(this.accountsSpace, this.fractionsSpace),
                    erc20: binary.substr(this.fractionsSpace + this.accountsSpace, this.erc20Space)
                };

                const combination = this.getCombinationFromBinary(data.accounts);
                const value = (parseInt(data.fractions, 2) + 1);
                
                ops.push({
                    type: "send",
                    from: combination[0].address,
                    to: combination[1].address,

                    erc20: this.erc20[parseInt(data.erc20, 2)],
                    value
                })

                for(let i=0;i<spacing;i++) ops.push({ type: "wait" });
            }
        

        return ops;
    }

    async getTransactionHistory (txHash?: string, type?: number, totalTransactions?: number) {
        const tx = txHash? await this.web3.eth.getTransaction(txHash) : { blockNumber: 0 };
        const addresses = this.accounts.map(acc => acc.address);
        const erc20Contracts = this.erc20.map(erc20 => new this.web3.eth.Contract(ERC_20_ABI, erc20)) //! ADD PAGINATION
        const erc20Events = await Promise.all(erc20Contracts.map(contract => 
            contract.getPastEvents("Transfer", {
                filter: {
                    from: addresses,
                    to: addresses
                },
                fromBlock: tx.blockNumber
            })
        ));
        const erc20SortedEvents = erc20Events.reduce((prev, cur) => [...prev, ...cur], []).sort((a, b) => b.blockNumber > a.blockNumber? -1 : b.blockNumber < a.blockNumber? 1 : b.transactionIndex > a.transactionIndex? -1 : 1)
        // console.log(type, erc20SortedEvents)

        let currentIndex = 0;
        let log: { type: number, data: Buffer }[] = [];
        let getOperation = i =>  erc20SortedEvents[i] && (<SendOperation>{
            type: "send",
            from: erc20SortedEvents[i].returnValues.from.toLowerCase(),
            to: erc20SortedEvents[i].returnValues.to.toLowerCase(),
            value: +erc20SortedEvents[i].returnValues.value,
            erc20: erc20SortedEvents[i].address.toLowerCase()
        });
        
        while (erc20SortedEvents[currentIndex + 1]) {
            let currentOp = getOperation(currentIndex + 1)
            let totalLength = this.getTotalLengthFromHeader(currentOp) * 8;
            let totalOperations = Math.ceil(totalLength/this.totalSpace);
            let txToReveal = new ExecutionPlan(this);
            const txRng = rng(this.chan, "tx");
            
            let i = 1;
            for (let j=0;j<totalOperations;j++) {
                const op = getOperation(currentIndex + i);
                if(!op) break;

                txToReveal.push(op)
                let n = 1 + txRng.int(1, this.maxSpacing)
                
                if(j + 1 < totalOperations) i += n;
            }

            const data = this.reveal(txToReveal);

            if(!data) currentIndex++;
            else {
                if(type === undefined || type === data.type) {
                    log.push(data);
                    if(totalTransactions && log.length >= totalTransactions) return log.map(parseTransaction);
                }
                currentIndex += i;
            }
        }

        return log.map(parseTransaction);
    }

    async revealFromTx (txHash?: string) {
        const tx = txHash? await this.web3.eth.getTransaction(txHash) : { blockNumber: 0 };
        const erc20Contracts = this.erc20.map(erc20 => new this.web3.eth.Contract(ERC_20_ABI, erc20)) //! ADD PAGINATION
        const addresses = this.accounts.map(acc => acc.address);
        const erc20Events = await Promise.all(erc20Contracts.map(contract => 
            contract.getPastEvents("Transfer", {
                filter: {
                    from: addresses,
                    to: addresses
                },
                fromBlock: tx.blockNumber
            })
        ));
        
        const erc20SortedEvents = erc20Events.reduce((prev, cur) => [...prev, ...cur], []).sort((a, b) => b.blockNumber > a.blockNumber? -1 : b.blockNumber < a.blockNumber? 1 : b.transactionIndex > a.transactionIndex? -1 : 1)
        const txHistory = new ExecutionPlan(this);
        
        const txRng  = rng(this.chan, "tx");
        
        for (let i=1;i<erc20SortedEvents.length;i+=1+txRng.int(1, this.maxSpacing)) {
            const event = erc20SortedEvents[i]
            const erc20 = event.address;
            const { from, to, value } = event.returnValues;
            
            txHistory.push({
                type: "send",
                from: from.toLowerCase(),
                to: to.toLowerCase(),
                value: +value,
                erc20: erc20.toLowerCase()
            })
        }

        return this.reveal(txHistory)
    }

    reveal (operations: ExecutionPlan) {
        return operations.reveal();
    }

    getBinaryFromCombination (combination: string[]) {
        let indexX = -1;
        let indexY = -1;

        let i=0;
        for (const account of this.accounts) {
            if(indexY > -1 && indexX > -1) break;
            
            if(account.address === combination[0]) indexX = i;
            else if (account.address === combination[1]) indexY = i;
            i++;
        }

        const a = indexX * this.accounts.length + indexY;
        return (a - Math.floor(a/(this.accounts.length + 1)) - 1).toString(2)
    }

    getCombinationFromBinary (binary: string) {
        const i = parseInt(binary, 2);
        const a = i + Math.floor(i/this.accounts.length) + 1;

        return [
            this.accounts[Math.floor(a/this.accounts.length)],
            this.accounts[Math.floor(a % this.accounts.length)]
        ]
    }

    getBinaryDataFromOperation (op: SendOperation) {
        const binary = this.getBinaryFromCombination([op.from, op.to]).padStart(this.accountsSpace, "0") +
                        (op.value - 1).toString(2).padStart(this.fractionsSpace, "0") +
                        this.erc20.indexOf(op.erc20).toString(2).padStart(this.erc20Space, "0")
        
        return binary;
    }

    getTotalLengthFromHeader (op: SendOperation) {
        return parseInt(this.getBinaryDataFromOperation(op).substr(0, 8).padStart(8, "0"), 2) + 1;
    }


    async getAccountWithEnoughEth (quantity: number) {
        for (const account of this.accounts) {
            const eth = await this.getBalance(account.address, "eth");
            
            if (eth >= (this.minEth + quantity)) return account.address;
        }
    }

    async getAccountWithEnoughTokens (erc20: string, quantity: number) {
        for (const account of this.accounts) {
            const eth = await this.getBalance(account.address, "eth");
            const tokens = await this.getBalance(account.address, erc20);

            if (eth >= this.minEth && tokens >= quantity) return account.address;
        }
    }
    
    async getBalance (addr: string, erc20: string) {
        balanceCache[addr] = balanceCache[addr] || {};

        if(balanceCache[addr][erc20]) return balanceCache[addr][erc20];
        if (erc20 === "eth") return balanceCache[addr][erc20] = await getEthBalance(this, addr)
        
        return balanceCache[addr][erc20] = await getTokenBalance(this, erc20, addr);
    }

    publicKey () {
        const publicConfig = generatePublicConfig({
            ACCOUNTS: this.accounts,
            CHANNEL: this.chan,
            ERC20_TOKENS: this.erc20,
            MAX_SPACING: this.maxSpacing,
            MINIMUM_ETH: this.minEth,
            NUMBER_OF_FRACTIONS: this.fractions,
            WEB3_PROVIDER: this.provider
        });

        return Buffer.from(JSON.stringify(publicConfig));
    }
}

export class ExecutionPlan extends Array<Operation> {

    constructor (public stego: ERC20Stego, ...start: Operation[]) {
        super();
        
        for (const el of start) this.push(el);
    }

    async execute () {
        const ex = new Execution(this);
        let i=1;
        let txIds = [];
        while (ex.currentOp) {
            log()
            log(cold("Operation " + i + "/" + this.length))
            const txId = await ex.executeOp(ex.currentOp);

            txIds.push(txId);
            ex.next();
            i++;
        }

        return txIds;
    }

    reveal () {
        //! TODO: Verify with random seeds the data from operations
        const operations = this;
        const usefulOperations = operations.filter(op => op.type === "send") as SendOperation[];

        const binary = usefulOperations.map(op => (
            this.stego.getBinaryFromCombination([op.from, op.to]).padStart(this.stego.accountsSpace, "0") +
            
            (op.value - 1).toString(2).padStart(this.stego.fractionsSpace, "0") +
            
            this.stego.erc20.indexOf(op.erc20).toString(2).padStart(this.stego.erc20Space, "0")
        )).join("");

        const data = new Uint8Array(Math.ceil(binary.length/8))

        for(let i=0;i<data.length;i++) {
            // console.log(parseInt(binary.substr(i * 8, 8).padStart(8, "0"), 2), binary.substr(i * 8, 8).padStart(8, "0"))
            data[i] = parseInt(binary.substr(i * 8, 8).padStart(8, "0"), 2);
        }

        const length = (data[0]);
        const buf = Buffer.from(data.slice(1, 1 + length));
        const dataSlice = buf.slice(0, buf.length - 2);
        const chkSlice = buf.slice(buf.length - 2);
        const chk = checksum(dataSlice.slice(1)); //! TODO: FIX THIS EMPANADA

        // console.log({
        //      totalTransactions: this.length,
        //      totalLengthData: data.length,
        //      length,
        //      totalBufData: buf,
        //      dataSlice,
        //      chkSlice,
        //      chk
        // })
        
        if(dataSlice[0] >= CONTENT_TYPE_NAME.length || (chk[0] | chk[1]) !== (chkSlice[0] | chkSlice[1])) return null;

        return {
            type: dataSlice[0],//CONTENT_TYPE_NAME[dataSlice[0]],
            data: dataSlice.slice(1)
        }
    } 
}

export class Execution {

    currentOp: Operation;
    nextOp: SendOperation;
    currentIndex: number = 0;

    constructor (public plan: ExecutionPlan) {
        this.currentOp = plan[0];
        this.nextOp = plan.find(e => e.type === "send") as SendOperation
    }

    next () {
        this.currentIndex++;
        this.currentOp = this.plan[this.currentIndex];
        this.nextOp = this.plan.find((o, i) => i >= this.currentIndex && o.type === "send") as any
    }

    executeOp (op: Operation) {
        return op.type === "send"? this.send(op) : this.wait(op);
    }

    async wait (op: WaitOperation) {
        if(!this.nextOp) return null;
        const status = await this.getOperationStatus(this.nextOp);

        if(status & STATUS_NO_GAS) {
            log(danger("Not enough ") + warning("ETH") + danger(" for the next operation. Supplying..."))
            await this.supplyEth(this.nextOp, this.plan.stego.minEth * 1.5)
        }

        if(status & STATUS_NO_TOKEN) {
            log(danger("Not enough " + warning(await getERC20Name(this.plan.stego, this.nextOp.erc20)) + " tokens for the next operation. Supplying..."))
            return await this.supplyToken(this.nextOp, this.nextOp.value)
        } else {
            return await this.supplyToken({
                type: "send",
                from: this.plan.stego.accounts[Math.floor(Math.random() * this.plan.stego.accounts.length)].address,
                to: "",
                erc20: this.plan.stego.erc20[Math.floor(Math.random() * this.plan.stego.erc20.length)],
                value: 0
            }, Math.floor(this.plan.stego.fractions * Math.random()))
        }
    }

    async send (op: SendOperation) {
        let txId: string;
        const erc20Name = op.erc20 === "eth"? "ETH" : await getERC20Name(this.plan.stego, op.erc20);

        log(highlight(`Sending `), op.value, warning(erc20Name), "from", cold(op.from), "to", cold(op.to))

        if(op.erc20 !== "eth") {
            txId = await sendTokenBalance(this.plan.stego, this.plan.stego.account(op.from), op.to, op.erc20, op.value);

            await this.updateBalance(op.from, op.erc20);
            await this.updateBalance(op.to, op.erc20);
        } else {
            txId = await sendEthBalance(this.plan.stego, this.plan.stego.account(op.from), op.to, op.value);
        }
        
        await this.updateBalance(op.from, "eth");
        await this.updateBalance(op.to, "eth");

        log(highlight("TxId:"), txId)
        return txId;
    }

    async getOperationStatus (op: SendOperation) {
        let { from, value } = op;
        let status = STATUS_OK;

        const eth = await this.getBalance(from, "eth");
        const token = await this.getBalance(from, op.erc20);
        
        if(eth < this.plan.stego.minEth) status |= STATUS_NO_GAS;
        if(token < value) status |= STATUS_NO_TOKEN;

        return status;        
    }

    async updateBalance (addr: string, erc20: string) {
        balanceCache[addr] = balanceCache[addr] || {};

        delete balanceCache[addr][erc20];
        return await this.getBalance(addr, erc20)
    }

    async getBalance (addr: string, erc20: string) {
        balanceCache[addr] = balanceCache[addr] || {};

        if(balanceCache[addr][erc20]) return balanceCache[addr][erc20];
        if (erc20 === "eth") return balanceCache[addr][erc20] = await getEthBalance(this.plan.stego, addr)
        
        return balanceCache[addr][erc20] = await getTokenBalance(this.plan.stego, erc20, addr);
    }

    async supplyEth (op: SendOperation, quantity: number) {
        for (const account of this.plan.stego.accounts) {
            const eth = await this.getBalance(account.address, "eth");
            
            if (eth >= (this.plan.stego.minEth + quantity)) {
                return await this.executeOp({
                    type: "send",
                    from: account.address,
                    to: op.from,
                    erc20: "eth",
                    value: quantity
                });
            }
        }
    }

    async supplyToken (op: SendOperation, quantity: number) {
        for (const account of this.plan.stego.accounts) {
            const eth = await this.getBalance(account.address, "eth");
            const tokens = await this.getBalance(account.address, op.erc20);

            if (eth >= this.plan.stego.minEth && tokens >= quantity) {
                return await this.executeOp({
                    type: "send",
                    from: account.address,
                    to: op.from,
                    erc20: op.erc20,
                    value: quantity
                });
            }
        }
    }
}

export function parseTransaction ({ type, data }) {
    switch (type) {
        case TYPE_RAW: return data;
        case TYPE_REDISCMD:
        case TYPE_TEXT: return data.toString();
        case TYPE_FILEHASH: return "https://gateway.pinata.cloud/ipfs/" + data.toString();
        case TYPE_CALL: return {
            method: data[0],
            params: msgpack.unpack(data.slice(1))
        }
    }
}