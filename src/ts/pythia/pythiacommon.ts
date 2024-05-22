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
