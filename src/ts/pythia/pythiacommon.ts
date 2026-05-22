import { UNSET } from "../ui/common";
import { PhyloTree, SummaryTree } from "./delphy_api";

export type BackLink = {nodeIndex: number, isExactMatch: boolean};

export type MccNodeBackLinks = BackLink[][];




// from https://stackoverflow.com/questions/69714815/create-a-random-bigint-for-miller-rabin-test
const big0 = BigInt(0);
const big16 = BigInt(65536);
// 0 .. 2^16-1
const rand16 =()=>BigInt(Math.floor(Math.random()*65536));
// -2^63 .. 2^63-1
export const randBigInt = ()=>BigInt( (((rand16() * big16) + rand16())* big16 + rand16()) * big16 + rand16() );




export class TipList {
  tips: number[];
  key: bigint;

  constructor() {
    this.tips = []
    this.key = big0;
  }

  add(tipIndex: number, tipHashes: BigInt64Array) : void {
    this.tips.push(tipIndex);
    this.key = this.key ^ tipHashes[tipIndex];
  }

  getKey() : string {
    return this.key.toString(10);
  }

  merge(left: TipList, right: TipList) : void {
    this.tips = left.tips.concat(right.tips);
    this.key = left.key ^ right.key;
  }

  getTips() : number[] {
    return this.tips.slice(0);
  }

  getCount() : number {
    return this.tips.length;
  }

}


export const getMRCA = (index1: number, index2: number,
  tree: PhyloTree | SummaryTree, tipCounts: number[]): number => {
  /* check for a common ancestor that is not root */
  let mrcaIndex = UNSET;
  const root = tree.getRootIndex();
  let i1 = index1,
    i2 = index2,
    steps = 0;
  while (i1 !== i2 && i1 !== root && i2 !== root) {
    /*
    the mrca will always have more tips
    so if we aren't matched yet, then take the
    parent of the node that has fewer tips.
    */
    const size1 = tipCounts[i1],
      size2 = tipCounts[i2];
    if (size1 < size2) {
      i1 = tree.getParentIndexOf(i1);
    } else {
      i2 = tree.getParentIndexOf(i2);
    }
    steps++;
    if (steps >= 1000) {
      console.warn(`we had a problem on ${index1} and ${index2}, setting mrca to root`)
      mrcaIndex = root;
      break;
    }
  }
  if (i1 === i2) {
    mrcaIndex = i1;
  } else if (i1 === root || i2 === root) {
    mrcaIndex = root;
  }
  return mrcaIndex;
}