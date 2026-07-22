import { UNSET } from "../ui/common";
import { PhyloTree } from "./delphy_api";
import { Pythia } from "./pythia";
import { randBigInt } from "./pythiacommon";


export type CladeScores = { [_ : string]: number };

export const getMccBaseTreeCount = (pythia: Pythia) : number =>{
  const start = pythia.kneeIndex;
  const end = pythia.getBaseTreeCount();
  return end - start;
}

export const getMccBaseTreeIndices = (pythia: Pythia) : number[] =>{
  const start = pythia.kneeIndex;
  const end = pythia.getBaseTreeCount();
  const indices: number[] = [];
  for (let i = start; i < end; i++) {
    indices.push(i);
  }
  return indices;
}

export const getMccBaseTrees = (pythia: Pythia) : PhyloTree[] =>{
  const start = pythia.kneeIndex;
  const end = pythia.getBaseTreeCount();
  const trees: PhyloTree[] = [];
  for (let i = start; i < end; i++) {
    trees.push(pythia.treeHist[i]);
  }
  return trees;
}


export const getTipFingerprints = (tipCount: number) : BigInt64Array => {
  const tipFingerprints = new BigInt64Array(tipCount);
  /* tips are the same in all trees, even there are a different number of nodes */
  for (let i = 0; i < tipCount; i++) {
    tipFingerprints[i] = randBigInt();
  }
  return tipFingerprints;
};


export const getNodeFingerprints = (tree: PhyloTree, tipFingerprints: BigInt64Array) : string[] => {
  const nodeCount = tree.getSize();
  const tipCount = (nodeCount + 1) / 2;
  const fingerprints = new BigInt64Array(nodeCount);
  fingerprints.fill(BigInt(0));
  for (let i = 0; i < tipCount; i++) {
    let n = i;
    while (n !== UNSET) {
      fingerprints[n] = fingerprints[n] ^ tipFingerprints[i];
      n = tree.getParentIndexOf(n);
    }
  }
  const asString: string[] = new Array(nodeCount);
  fingerprints.forEach((fingerprint, i)=>asString[i] = `${fingerprint}`);
  return asString;
}

export const getTreeClades = (pythia: Pythia) : string[][] => {
  const start = pythia.kneeIndex;
  const end = pythia.getBaseTreeCount();
  const treeCount = end - start;
  const firstTree = pythia.treeHist[start];
  const nodeCount = firstTree.getSize();
  const tipCount = (nodeCount + 1) / 2;
  const tipFingerprints = getTipFingerprints(tipCount);
  const treeCladeFingerprints : string[][] = new Array(treeCount);
  for (let i = start; i < end; i++) {
    const tree = pythia.treeHist[i];
    treeCladeFingerprints[i] = getNodeFingerprints(tree, tipFingerprints);
  }
  return treeCladeFingerprints;
}


/*
@param treeClades: an array of string[]
    each inner string[] corresponds to a base tree, where the entries
        in the string[] correspond to the nodes in the base tree.
    each string in the inner array is the fingerprint of
        all the tips in the clade.
@param treeCount: the number of trees that have data (so excluding the ones in the burn in period)
*/
export const getCladeScores = (treeClades: string[][], treeCount: number) : CladeScores =>{
  const cladeScores: CladeScores = {};
  treeClades.forEach((cladeList: string[])=>{
    cladeList.forEach((key:string)=>{
      if (cladeScores[key] === undefined) {
        cladeScores[key] = 1;
      } else {
        cladeScores[key]++;
      }
    });
  });
  Object.keys(cladeScores).forEach(key=>{
    cladeScores[key] /= treeCount;
  });
  return cladeScores;
};


export const getTreeScore = (cladeList: string[], cladeScores: CladeScores, firstCladeIndex: number) : number => {
  let score = 0;
  for (let i = firstCladeIndex; i < cladeList.length; i++) {
    const clade = cladeList[i];
    const cladeScore = cladeScores[clade];
    const lnScore = Math.log(cladeScore);
    score += lnScore;
  }
  return score;
};


export const getBaseTreeScores = (pythia: Pythia): number[] => {
  const treeCount = getMccBaseTreeCount(pythia);
  const treeClades = getTreeClades(pythia);
  const cladeScores = getCladeScores(treeClades, treeCount);
  const nodeCount = treeClades[0].length;
  const tipCount = (nodeCount + 1) / 2;
  const treeScores: number[] = treeClades.map((cladeList:string[])=>getTreeScore(cladeList, cladeScores, tipCount));
  return treeScores;
}