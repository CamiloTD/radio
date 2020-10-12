import Redis from "ioredis";

export class Storage {
    redis: Redis;

    constructor () {
        this.redis = new Redis({ db: 15 });
    }
}