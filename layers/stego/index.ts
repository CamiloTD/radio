export abstract class Stego<T> {
    abstract hide (data: Buffer): T;
    abstract reveal (data: T): Buffer
}

export * from './erc20';