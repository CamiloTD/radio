import { isFunctionExpression } from "typescript";

export interface Config {
    WEB3_PROVIDER: string;
    NUMBER_OF_FRACTIONS: number;

    MAX_SPACING: number;
    MINIMUM_ETH: number;
    VERBOSE: boolean;
    
    ACCOUNTS: Account[];
    ERC20_TOKENS: string[]
    CHANNEL: string;

    PINATA_KEY?: string;
    PINATA_SECRET?: string;
}

export interface Account { pkey: string, address: string }
export interface SendOperation {
    type: "send";
    
    erc20: string;
    from: string;
    to: string;

    value: number;
}

export interface WaitOperation { type: "wait" }

export type Operation = SendOperation | WaitOperation;

export const TYPE_RAW = 0;
export const TYPE_TEXT = 1;
export const TYPE_FILEHASH = 2;
export const TYPE_REDISCMD = 3;
export const TYPE_CALL = 4;

export type CONTENT_TYPE = number;
export const CONTENT_TYPE_NAME = ["raw", "text", "hash", "redis", "call"];