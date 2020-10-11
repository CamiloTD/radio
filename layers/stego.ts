import { log, cold, highlight } from "termx";
import Web3 from "web3";
import HDWalletProvider from "@truffle/hdwallet-provider";
import { CHANNEL, ETH_PRIVATE_KEY, MAX_SPACING, MAX_SPEND, NUMBER_OF_ACCOUNTS, NUMBER_OF_ERC20, NUMBER_OF_FRACTIONS, WEB3_PROVIDER } from "./config";
import { rng } from "./random";
import { Account, Operation, SendOperation } from "./types";

export class Environment {

    private accountCombinations: number[][];

    web3: Web3;
    accounts: Account[];
    fractions: number;
    chan: string;
    erc20: string[]

    accountsSpace: number;
    fractionsSpace: number;
    erc20Space: number;
    totalSpace: number;

    constructor (web3: Web3, accounts: Account[], fractions: number, erc20: string[], chan: string) {
        this.web3 = web3;
        this.accounts = accounts;
        this.fractions = fractions;
        this.erc20 = erc20;
        this.chan = chan;

        this.createAccountCombinatories();

        this.accountsSpace  = Math.floor(Math.log2(this.accountCombinations.length));
        this.fractionsSpace = Math.floor(Math.log2(fractions));
        this.erc20Space     = Math.floor(Math.log2(erc20.length));

        this.totalSpace = this.accountsSpace + this.fractionsSpace + this.erc20Space;

        log(cold("New Environment Created:"));
        log(cold("Account Combinations:"), this.accountCombinations.length, highlight(`(${this.accountsSpace} bits)`));
        log(cold("Fractions:"), fractions, highlight(`(${this.fractionsSpace} bits)`));
        log(cold("ERC-20s:"), erc20.length, highlight(`(${this.erc20Space} bits)`));
        log(cold("Total Space per Transaction:"), this.totalSpace, "bits");
    }

    account (address: string) {
        return this.accounts.find(acc => acc.address === address);
    }

    getOperationsFor (data: string) {
        //? Slices the data in chunks
            var bufs = [];
            var buf = Buffer.from(data);
            var dataHeader = [buf.length & 0xFF000000, buf.length & 0x00FF0000, buf.length & 0x0000FF00, buf.length & 0x000000FF];
            buf = Buffer.from([...dataHeader, ...buf])
            var spaceInBytes = Math.floor(this.totalSpace/8);

            for (let i=0;i<buf.length;i+=spaceInBytes) bufs.push(
                buf.slice(i, i + spaceInBytes)
            );
        
        //? Generate Random Seeds
            const txRng  = rng(this.chan, "tx");

        //? Results
            const ops: Operation[] = [{ type: "wait" }];

            for (const buf of bufs) {
                const spacing = txRng.int(0, MAX_SPACING);
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

    getDataFromOperations (operations: Operation[]) {
        //! TODO: Verify with random seeds the data from operations
        const usefulOperations = operations.filter(op => op.type === "send") as SendOperation[];
        const binary = usefulOperations.map(op => (
            this.getBinaryFromCombination([op.from, op.to]) +
            
            (op.value - 1).toString(2).padStart(this.fractionsSpace, "0") +
            
            this.erc20.indexOf(op.erc20).toString(2).padStart(this.erc20Space, "0")
        )).join("");
        
        // console.log(usefulOperations.map(op => (
        //     this.getBinaryFromCombination([op.from, op.to]) +
            
        //     ((MAX_SPEND / op.value) - 1).toString(2).padStart(this.fractionsSpace, "0") +
            
        //     this.erc20.indexOf(op.erc20).toString(2).padStart(this.erc20Space, "0")
        // )))

        const data = new Uint8Array(Math.ceil(binary.length/8))

        for(let i=0;i<data.length;i++) {
            // console.log(parseInt(binary.substr(i * 8, 8).padStart(8, "0"), 2), binary.substr(i * 8, 8).padStart(8, "0"))
            data[i] = parseInt(binary.substr(i * 8, 8).padStart(8, "0"), 2);
        }

        const length = (data[0]) | (data[1]) | (data[2]) | (data[3]);

        return Buffer.from(data.slice(4, 4 + length)).toString();
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

        i = 0;
        for(const combination of this.accountCombinations) {
            if(combination[0] === indexX && combination[1] === indexY) return i.toString(2).padStart(this.accountsSpace, "0");
            i++;
        }

        throw new Error("No Combination found for address (" + combination + ") (" + indexX + ", " + indexY + ")");
    }

    getCombinationFromBinary (binary: string) {
        const index = this.accountCombinations[parseInt(binary, 2)];

        return [
            this.accounts[index[0]],
            this.accounts[index[1]]
        ]
    }

    createAccountCombinatories () {
        this.accountCombinations = [];
        let y = 0;
        let x = 0;
        for(let account of this.accounts) {
            y = 0;
            for(let account2 of this.accounts) {
                if(account !== account2) this.accountCombinations.push([x, y]);
                y++;
            }
            x++;
        }
    }

}