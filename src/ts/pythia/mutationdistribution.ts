import { Mutation } from './delphy_api';

export class MutationDistribution {
  mutation: Mutation;
  times: number[];
  // treeIndices: number[];
  possibleTrees: number;
  isApobecCtx: boolean;

  constructor(mut: Mutation, totalTrees: number, isApobecCtx: boolean) {
    this.mutation = mut;
    this.times = [];
    // this.treeIndices = [];
    this.possibleTrees = totalTrees;
    this.isApobecCtx = isApobecCtx;
  }

  // addTime(t: number, treeIndex: number): void {
  //   this.times.push(t);
  //   this.treeIndices.push(treeIndex);
  // }

  addTime(t: number): void {
    this.times.push(t);
  }

  getConfidence():number {
    return this.times.length / this.possibleTrees;
  }

}