import { ERC20Stego } from "./layers/stego";
import { resolveConfig } from "./utils/keyfile";

async function init () {
    const stego = new ERC20Stego(await resolveConfig({
        key: "secret.key",
        pass: "default"
    }));

    const contract = await stego.contract("0x046c7371fef8f721a2a5c829dde4c1d86139ceebe2160ba9653fb86dce2e5c12");
    console.log(await contract.count())
}

init().catch(console.log)
process.on('uncaughtException', console.log)