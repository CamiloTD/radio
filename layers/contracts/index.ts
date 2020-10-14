import Axios from "axios";

import msgpack from "msgpack";

import { cold } from "termx";

import { VM } from "vm2";

import { RedisStorage } from "../redis";
import { TYPE_CALL, TYPE_FILEHASH } from "../../types";
import { ERC20Stego } from "../stego/erc20";
// 0x046c7371fef8f721a2a5c829dde4c1d86139ceebe2160ba9653fb86dce2e5c12
// 0x6683e0583fabb481c521007f929d5a77a7e63c071b4e00c2510df7475dd3dfc2

// Real: 0xbd4e19b6c3db3b999781e5667c4479d73c98ad5195062f2a69481a914d8a80aa

export async function Contract (stego: ERC20Stego, txId: string) {
    const [ hash ] = await stego.getTransactionHistory(txId, TYPE_FILEHASH, 1)
    const { data } = await Axios.get(hash);
    const db = new RedisStorage(stego, txId, false);
    const vm = new VM({ timeout: 1000 });
    const contract = vm.run(data);
    const transactionFactory: any = {};

    async function initDb () {
        const calls = await stego.getTransactionHistory(txId, TYPE_CALL);
        await db.redis.flushall();

        for (const call of calls) {
            const sandbox = {};
    
            [ "lpop", "lpush", "set", "del", "hset", "hdel", "incr", "incrby", "hincrby" ].forEach(name => sandbox[name] = function (...data) {
                // operations.push([name, ...data]);
                return db.redis[name](...data)
            });
    
            [ "hget", "get" ].forEach(name => {
                sandbox[name] = function (...data) {
                    return db.redis[name](...data)
                }
            });
            
            const vm = new VM({ timeout: 1000, sandbox });
            const contractInstance = vm.run(data);
    
            // console.log("Executing", contractInstance[Object.keys(contractInstance)[call.method]], call.params)
            
            await contractInstance[Object.keys(contractInstance)[call.method]](...call.params);
        }
    }

    for (const method in contract) {
        transactionFactory[method] = async function(...params: any[]) {
            await initDb();
            
            const operations = [];
            const sandbox = {};

            [ "lpop", "lpush", "set", "del", "hset", "hdel", "incr", "incrby", "hincrby" ].forEach(name => sandbox[name] = function (...data) {
                operations.push([name, ...data]);
                return db.redis[name](...data)
            });

            [ "hget", "get" ].forEach(name => {
                sandbox[name] = function (...data) {
                    return db.redis[name](...data)
                }
            });
        
            const vm = new VM({ timeout: 1000, sandbox });
            const result = await vm.run(data)[method](...params)

            if (operations.length > 0) {
                for (const operation of operations) {
                    
                    const ex = await stego.hide(Buffer.from([
                        Object.keys(contract).indexOf(method),
                        ...msgpack.pack(params)
                    ]), TYPE_CALL);

                    await ex.execute();
                }
            }

            return result;
        }
    }

    return transactionFactory;
}