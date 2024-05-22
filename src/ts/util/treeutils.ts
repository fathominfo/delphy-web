import {Tree} from '../pythia/delphy_api';

export const getTipCounts = (tree: Tree) : number[] => {
  const size = tree.getSize(),
    tipCounts = Array(size).fill(0);
  for (let i = 0; i < size; i++) {
    if (isTip(tree, i)) {
      let j = i;
      while (j >= 0) {
        tipCounts[j]++;
        j = tree.getParentIndexOf(j);
      }
    }
  }
  return tipCounts;
};


export const isTip = (tree: Tree, nodeIndex: number) : boolean => {
  return tree.getNumChildrenOf(nodeIndex) === 0;
};