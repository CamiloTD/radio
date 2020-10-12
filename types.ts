export interface Config {
    WEB3_PROVIDER: string;
    NUMBER_OF_FRACTIONS: number;

    MAX_SPACING: number;
    MINIMUM_ETH: number;
    VERBOSE: boolean;
    
    ACCOUNTS: Account[];
    ERC20_TOKENS: string[]
    CHANNEL: string;
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