import PinataSDK from "@pinata/sdk";

import path from "path";

import fs from  "fs";

import util from "util";

import streamBuffers from "stream-buffers";

import { ERC20Stego } from "../stego";
import { TYPE_FILEHASH } from "../../types";

export const removeFile = util.promisify(fs.unlink);
export const readFile = util.promisify(fs.readFile);
export const writeFile = util.promisify(fs.writeFile);
/*
 
  __     __         _       _     _           
  \ \   / /_ _ _ __(_) __ _| |__ | | ___  ___ 
   \ \ / / _` | '__| |/ _` | '_ \| |/ _ \/ __|
    \ V / (_| | |  | | (_| | |_) | |  __/\__ \
     \_/ \__,_|_|  |_|\__,_|_.__/|_|\___||___/
                                              
 
*/

/*
 
   _____                 _   _                 
  |  ___|   _ _ __   ___| |_(_) ___  _ __  ___ 
  | |_ | | | | '_ \ / __| __| |/ _ \| '_ \/ __|
  |  _|| |_| | | | | (__| |_| | (_) | | | \__ \
  |_|   \__,_|_| |_|\___|\__|_|\___/|_| |_|___/
                                               
 
*/

export class IPFStorage {

  pinata: typeof PinataSDK;
  stego: ERC20Stego;

  constructor (stego: ERC20Stego, PINATA_KEY: string, PINATA_SECRET: string) {
    this.pinata = PinataSDK(PINATA_KEY, PINATA_SECRET);
    this.stego = stego;
  }

  async save (filename: string) {
    const { IpfsHash } = await this.pinata.pinFileToIPFS(fs.createReadStream(filename));

    console.log(IpfsHash)
    
    return IpfsHash;
  }

  async uploadFile (filename: string) {
      const hash = await this.save(filename);
      const tx = await this.stego.hide(Buffer.from(hash), TYPE_FILEHASH);

      return await tx.execute();
  }

}