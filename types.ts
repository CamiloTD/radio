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