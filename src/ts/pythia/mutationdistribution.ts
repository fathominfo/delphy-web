import { Mutation } from './delphy_api';

// export class MutationDistribution {
//   mutation: Mutation;
//   times: number[];
//   // treeIndices: number[];
//   possibleTrees: number;
//   isApobecCtx: boolean;

//   constructor(mut: Mutation, totalTrees: number, isApobecCtx: boolean) {
//     this.mutation = mut;
//     this.times = [];
//     this.possibleTrees = totalTrees;
//     this.isApobecCtx = isApobecCtx;
//   }

// }

export type MutationDistribution = {
  mutation: Mutation;
  times: number[];
  possibleTrees: number;
  isApobecCtx: boolean;
}


export const addMutationTime = (md: MutationDistribution, t: number) : void => {
  md.times.push(t);
};


export const getMutationConfidence = (md: MutationDistribution) : number => {
  return md.times.length / md.possibleTrees;
};