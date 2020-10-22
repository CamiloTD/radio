import { ERC20Stego } from "./layers/stego";
import { resolveConfig } from "./utils/keyfile";

async function init () {
    const stego = new ERC20Stego(await resolveConfig({
        key: "secret.key",
        pass: "default"
    }));

    const contract = await stego.contract("0xf663fad69803d9734e9e7da4fb3a37ac97cab554f6ec2003b8d0ac1da845bd33");
    
    // console.log(await contract.addUser("Matt"));
    // console.log(await contract.addUser("Cami"));
    // console.log(await contract.addUser("Jose"));
    
    console.log(await contract.getAllUsers())
}

init().catch(console.log)
process.on('uncaughtException', console.log)