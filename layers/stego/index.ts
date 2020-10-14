import { CONTENT_TYPE } from '../../types';

export abstract class Stego<T> {
    abstract hide (data: Buffer, type: CONTENT_TYPE): T;
    abstract reveal (data: T): { type: CONTENT_TYPE, data: Buffer };
}

export * from './erc20';