import {PhyloTree, Tree} from '../pythia/delphy_api';
import { UNSET } from '../ui/common';
import { NodeSchematic } from '../ui/lineages/nodeschematic';

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



export interface InheritanceNode {
  index: number,
  children: InheritanceNode[]
}

/*
TODO:
can we use this logic for other inheritance related analysis
  * characterizing mutations of interest as reversals, etc?
    (also see the ms-smartermutations-260417 branch)
  * building the NodeSchematic tree ?
[mark 260423]
*/

/*
for a set of nodes within a tree, identify the ancestors and descendants
*/
export const assembleInheritanceTree = (tree: Tree, nodes: number[]) : InheritanceNode => {
  /* create the node objects organized by node index */
  const schematics: InheritanceNode [] = [];
  nodes.forEach(index=>schematics[index] = {index, children: []});
  const roots: InheritanceNode[] = [];
  /* for each node, assign it to its nearest ancestor */
  schematics.forEach(schematic=>{
    let parent: InheritanceNode;
    let index = tree.getParentIndexOf(schematic.index);
    while (index !== UNSET) {
      parent = schematics[index];
      if (parent !== undefined) {
        parent.children.push(schematic);
        break;
      }
      index = tree.getParentIndexOf(index);
    }
    if (index === UNSET) {
      roots.push(schematic);
    }
  });
  /*
  if there's one node left, it's the root
  otherwise, create a root and assign the remaining nodes as its children
  */
  if (roots.length === 1) {
    return roots[0];
  } else {
    if (roots.length === 0) {
      console.warn('you got a bad assumption');
    } else {
      console.warn('gotta make a new node!');
    }
    const rootIindex = tree.getRootIndex();
    const root: InheritanceNode = {index: rootIindex, children: roots};
    return root;
  }
}

export interface NodeParentIndex {
  node: number,
  parent: number
}

export const getParents = (root: InheritanceNode) : NodeParentIndex[]=>{
  const parents: NodeParentIndex[] = [];
  const q = [root];
  while (q.length > 0) {
    const skeem: InheritanceNode | undefined = q.shift();
    if (skeem !== undefined) {
      skeem.children.forEach(schemingChild=>{
        /*
        insert the descendant at the start of the list,
        so that when iterating, by the time we get to a node,
        we will already have processed its children
        */
        parents.unshift({node: schemingChild.index, parent: skeem.index});
        q.push(schemingChild);
      });
    }
  }
  return parents;
}