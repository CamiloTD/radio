import path from "path";
import fs from  "fs";
import PinataSDK from "@pinata/sdk";
import util from "util";
import streamBuffers from "stream-buffers";

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

class Storage {

  pinata: typeof PinataSDK;

  constructor (PINATA_KEY: string, PINATA_SECRET: string) {
    this.pinata = PinataSDK(PINATA_KEY, PINATA_SECRET);
  }

  async save (data: Buffer) {
    const readStream = new streamBuffers.ReadableStreamBuffer({
      frequency: 1,
      chunkSize: 4096
    });

    readStream.put(data)

    const { IpfsHash } = await this.pinata.pinFileToIPFS(readStream);
    return IpfsHash;
  }

  load (hash: string) {

  }

}

export async function initIPFS (PINATA_KEY: string, PINATA_SECRET: string) {
    const pinata = PinataSDK(PINATA_KEY, PINATA_SECRET);
    await pinata.testAuthentication();

    console.log("Connected to Piñata! 🎉");
    return pinata;
}

// export async function uploadFile (filename: string, name?: string) {
//     const data = await pinata.pinFileToIPFS(fs.createReadStream(filename), name && { pinataMetadata: { name } });

//     console.log("✨ Pinned " + filename + " as https://ipfs.io/ipfs/" + data.IpfsHash);

//     return data;
// }