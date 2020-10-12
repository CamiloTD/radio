import random from "random";
import seedrandom from "seedrandom";

export function rng (seed, type) {
    return (random as any).clone(seedrandom(seed + ":" + type));
}