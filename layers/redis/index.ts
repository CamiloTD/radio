import Redis from "ioredis";

import { IPFStorage } from "../ipfs";
import { ERC20Stego } from "../stego";
import { TYPE_FILEHASH, TYPE_REDISCMD } from "../../utils/types";

const GLOBAL_DB = 15;
const TEMP_DB = 14;

export class RedisStorage {
    redis: Redis;
    txId: string;
    stego: ERC20Stego;

    constructor (stego: ERC20Stego, txId: string, public isTemporal?: boolean) {
        this.redis = new Redis({ db: isTemporal? TEMP_DB : GLOBAL_DB });
        this.txId = txId;
        this.stego = stego;
    }

    async command (cmd: string) {
        const ex = await this.stego.hide(Buffer.from(cmd), TYPE_REDISCMD);

        return await ex.execute();
    }

    async init () {
        const txHistory = await this.stego.getTransactionHistory(this.txId, TYPE_REDISCMD);
        await this.redis.flushall();
        
        return await this.redis.pipeline(txHistory.map(x => x.data.toString().split(" "))).exec()
    }

}