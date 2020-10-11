import random from "random";
import seedrandom from "seedrandom";

export function rng (seed, type) {
    return random.clone(seedrandom(seed + ":" + type));
}