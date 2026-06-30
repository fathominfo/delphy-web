import { PhyloTree, MccTree, Mutation } from './delphy_api';
import { getMutationName, NUC_LOOKUP } from '../constants';
import { isTip } from '../util/treeutils';
import { checkApobecCtx } from './pythia';
import { UNSET } from '../ui/common';

export const enum FeatureOfInterest {
  Reversals = "reversals",
  SameSite = "same_site",
  MultipleIntroductions = "multiple_introductions",
  ManyTips = "many_tips"
}

export type TreeInterestData = {treeIndex: number, intros: Introduction[]};
export type InterestData = {confidence: number, introductions: TreeInterestData[]};


export interface Introduction {
  mutation: Mutation;
  nodeIndex: number;
}

export interface SameSiteIntroductions {
  treeIndex: number;
  site: number;
  introductions: Introduction[];
  alleleHist: string;
  tree: MutTreeNode[]
}


export interface MutTreeNode {
  node: number,
  descendants: MutTreeNode[],
  tipCount: number
}

interface MutTreeTempNode {
  node: number,
  descendants: MutTreeTempNode[],
  tipCount: number,
  trail: number[],
}


export interface SameSiteIntroductionSupport {
  site: number;
  trees: SameSiteIntroductions[];
  percent: number;
}



export interface MutationOfInterest {
  mutation: Mutation;
  name: string;
  treeCount: number;
  confidence: number;
  baseTipCounts: number[];
  medianTipCount: number;
  isApobec: number;
  features?: {[key: string]: InterestData}
}

export type MutationOfInterestSet = {
  [FeatureOfInterest.SameSite]: MutationOfInterest[],
  [FeatureOfInterest.MultipleIntroductions]: MutationOfInterest[],
  [FeatureOfInterest.Reversals]: MutationOfInterest[],
  all: MutationOfInterest[],
  treeCount: number
}

/*
For each site on the genome, track the mutations that occur at that site.
@return: an array indexed by site location. Each item in the array is an
  array of introductions, tracking the mutation and the node associated
  with it.
*/
function gatherTreeMutations(tree: PhyloTree): Introduction[][] {
  let i: number;
  const candidates: Introduction[][] = [],
    nodeCount = tree.getSize(),
    siteTallier = (m: Mutation)=>{
      if (isFinite(m.time)) {
        let siteIntroductions: Introduction[] = candidates[m.site];
        if (!siteIntroductions) {
          siteIntroductions = [];
          candidates[m.site] = siteIntroductions;
        }
        siteIntroductions.push({mutation: m, nodeIndex: i});
      }
    };
  for (i = 0; i < nodeCount; i++) {
    tree.forEachMutationOf(i, siteTallier);
  }
  return candidates;
}



function getNodeCounts(tree: PhyloTree) : number[] {
  const nodeCount = tree.getSize(),
    nodeTips: number[] = Array(nodeCount).fill(0);
  for (let i = 0; i < nodeCount; i++) {
    if (isTip(tree, i)) {
      let p = i;
      while (p !== -1) {
        nodeTips[p]++;
        p = tree.getParentIndexOf(p);
      }
    }
  }
  return nodeTips;
}




/*
determine whether mutations are descendants of one another,
or occur on independent branches
*/
const getMutationTree = (tree: PhyloTree, intros: Introduction[]): MutTreeNode[] => {
  const trails = intros.map(intro=>getPathToRoot(tree, intro.nodeIndex));
  const ancestries = groupInheritance(trails);
  setMutationTreeTipCounts(ancestries, tree);
  return ancestries;
};

const getPathToRoot = (tree: PhyloTree, nodeIndex: number) : number[] => {
  const ancestry: number[] = [];
  while (nodeIndex !== UNSET) {
    ancestry.unshift(nodeIndex);
    nodeIndex = tree.getParentIndexOf(nodeIndex);
  }
  return ancestry;
};


const setMutationTreeTipCounts = (ancestries: MutTreeNode[], tree: PhyloTree)=>{
  const tipCounts: number[] = [];
  /*
  build a list of all the nodes that need tip counts.
  Generally, farther down the list will be closer to tips
  */
  const q: MutTreeNode[] = ancestries.slice(0);
  let qIndex = 0;
  let mtn: MutTreeNode;
  let node: number;
  while (qIndex < q.length) {
    mtn = q[qIndex];
    mtn.descendants.forEach(desc=>q.push(desc));
    qIndex++;
  }
  const nodeQ: number[] = [];
  let nIndex: number;
  let tipCount = 0;
  let leftIndex: number;
  let rightIndex: number;
  let tmpCount: number;
  while (qIndex > 0) {
    qIndex--;
    mtn = q[qIndex];
    nodeQ.length = 0;
    nodeQ.push(mtn.node);
    while (nodeQ.length > 0) {
      nIndex = nodeQ.length - 1;
      node = nodeQ[nIndex];
      tipCount = tipCounts[node];
      if (tipCount !== undefined) {
        // the work for this node is done
        nodeQ.pop();
      } else {
        leftIndex = tree.getLeftChildIndexOf(node);
        rightIndex = tree.getRightChildIndexOf(node);
        if (leftIndex === UNSET) {
          // this is a tip, and we're done here
          tipCount = 1;
          tipCounts[node] = 1;
          nodeQ.pop();
        } else {
          tipCount = tipCounts[leftIndex];
          tmpCount = tipCounts[rightIndex];
          if (tipCount === undefined) {
            nodeQ.push(leftIndex);
            if (tmpCount === undefined) {
              nodeQ.push(rightIndex);
            }
          } else if (tmpCount === undefined) {
            nodeQ.push(rightIndex);
          } else {
            tipCount += tmpCount;
            tipCounts[node] = tipCount;
            // we got the info we need
            nodeQ.pop();
          }
        }
      }
    }
    mtn.tipCount = tipCount;
  }
};


const hereC = 0;


/*
@param trails: each trail is an array of node indexes, starting at root and ending
at the node to which the mutation is attached.
*/
const groupInheritance = (trails: number[][]) : MutTreeNode[] => {
  const root = trails[0][0];
  const rootNode: MutTreeTempNode = {
    node: root,
    descendants: [],
    trail: [],
    tipCount: 0
  }
  /* store the node indices that have mutations attached */
  const mutationNodes: number[] = [];
  trails.forEach(trail=>{
    trail.shift(); // remove the root node
    const node = trail[trail.length - 1];
    const tipCount = 0; // we'll set this later
    rootNode.descendants.push({ node, descendants: [], trail, tipCount });
    // if (node === 225) {
    //   hereC++;
    //   if (hereC ===3) {
    //     console.log(`
    //     here ${ hereC }   ${ mutationNodes.length }
    //     `)
    //   }
    // }
    mutationNodes.push(node);
  });
  const q: MutTreeTempNode[] = [rootNode];
  const goToSplit = (mttn: MutTreeTempNode)=>{
    const descendants = mttn.descendants;
    let splitFound = false
    let theExhausted : MutTreeTempNode | null = null ;
    let any = true;
    let node: number | undefined;
    const paths: MutTreeTempNode[][] = [];
    while (!splitFound && any) {
      paths.length = 0;
      any = false;
      theExhausted = null;
      descendants.forEach((desc: MutTreeTempNode)=>{
        node = desc.trail.shift();
        if (node !== undefined) {
          if (desc.trail.length === 0) {
            theExhausted = desc;
          }
          any = true;
          if (paths[node] === undefined) {
            paths[node] = [];
          }
          paths[node].push(desc);
        }
      });
      if (paths.filter(n=>!!n).length > 1) {
        splitFound = true;
      } else {
        /*
        replace the current MutTreeNode.node with value
        that is common to all these paths, since that will
        be the more recent common ancestor.
        */
        if (node !== undefined) {
          mttn.node = node;
        }
        if (theExhausted !== null) {
          // we have done as much as we can do
          any = false;
          descendants.forEach(d=>{
            if (d !== theExhausted) {
              theExhausted?.descendants.push(d);
            }
          });
          mttn.descendants.length = 0;
          mttn.descendants.push(theExhausted);
          q.push(theExhausted)
        }
      }
    }
    if (splitFound) {
      mttn.descendants.length = 0;
      paths.forEach((descendants, node)=>{
        const branch: MutTreeTempNode = {
          node, descendants: [], trail: [], tipCount: 0
        };
        if (descendants.length === 1) {
          branch.node = descendants[0].node;
        } else if (descendants.length > 1) {
          descendants.forEach(desc=>{
            if (desc.node !== node) {
              branch.descendants.push(desc);
            }
          });
        }
        mttn.descendants.push(branch);
        if (branch.descendants.length > 1) {
          q.push(branch);
        }
      })
    }
  }
  while (q.length > 0) {
    const mttn = q.shift();
    if (mttn) {
      goToSplit(mttn);
    }
  }
  const convertQueue: [MutTreeTempNode, MutTreeNode|null][] = [];
  const convertNode = (tmp: MutTreeTempNode, parent: MutTreeNode|null) : MutTreeNode => {
    const converted: MutTreeNode = {
      node: tmp.node,
      descendants: [],
      tipCount: UNSET
    };
    let parentTarget: MutTreeNode = converted;
    if (parent !== null) {
      /*
      our algorithm will include nodes that aren't nodes with
      mutations when that node is a branching point. For our
      purposes here, we don't need to track those branching
      points, so we filter those out.
      */
      if (mutationNodes.indexOf(tmp.node) >= 0) {
        if (parent.node !== converted.node) {
          parent.descendants.push(converted);
        }
      } else {
        parentTarget = parent;
      }
    }
    tmp.descendants.forEach(desc=>{
      convertQueue.push([desc, parentTarget]);
    });
    return converted;
  };
  const convertedRoot = convertNode(rootNode, null);
  while (convertQueue.length > 0) {
    const item = convertQueue.shift();
    if (item) {
      const [tmp, parent] = item;
      convertNode(tmp, parent);
    }
  }
  return convertedRoot.descendants;
};


{
  /* test groupInheritance */
  const trails: number[][] = [
    // [1, 2],
    // [1, 2, 7],
    [1, 3],
    [1, 3, 5, 6],
    [1, 3, 4],
    [1, 3, 5],
    // [1, 8],
    // [1, 9, 10, 11],
    // [1, 9, 10, 12],
    // [1, 13, 14],
    // [1, 13, 14, 15, 16],
    // [1, 13, 14, 15, 17],
    // [1, 225],
    // [1, 225, 260, 228],
  ];
  const result = groupInheritance(trails);
  const desired : MutTreeNode[] = [
    // {node: 2, descendants: [{node: 7, descendants: [], tipCount: 0}], tipCount: 0},
    {node: 3, descendants: [
      {node: 4, descendants: [], tipCount: 0},
      {node: 5, descendants: [{node: 6, descendants: [], tipCount: 0}], tipCount: 0}
    ], tipCount: 0},
    // {node: 8, descendants: [], tipCount: 0},
    // {node: 14, descendants: [{node: 16, descendants: [], tipCount: 0}, {node: 17, descendants: [], tipCount: 0}], tipCount: 0},
    // {node: 11, descendants: [], tipCount: 0},
    // {node: 12, descendants: [], tipCount: 0},
    // {node:225, descendants:[
    //   {node:228,descendants:[],tipCount:-1}
    // ],tipCount:-1}
  ];
  console.log(`test groupInheritance\n`,
    JSON.stringify(desired), '\n',
    JSON.stringify(result));
}


//    {node: 2, descendants: [{node: 7, descendants: []}]},                                    A->G->A
//     {node: 3, descendants: [                                                                A->G->[G,G->A]
//       {node: 4, descendants: []},
//       {node: 5, descendants: [{node: 6, descendants: []}]}
//     ]},
//     {node: 8, descendants: []},                                                             A->G
//     {node: 14, descendants: [{node: 16, descendants: []}, {node: 17, descendants: []}]},    A->[G,C]


interface IntroLookup {[_:number]: Introduction}
interface StringWrap { s: string }

const addDescendants = (mtn2: MutTreeNode, s: StringWrap, introLookup: IntroLookup)=>{
  const descendants = mtn2.descendants;
  let intro: Introduction;
  let mut: Mutation;
  let node: number;
  switch(descendants.length) {
  case 0: break;
  case 1:
    intro = introLookup[descendants[0].node];
    mut = intro.mutation;
    node = intro.nodeIndex;
    s.s += `->${NUC_LOOKUP[mut.to]}${node}`;
    addDescendants(descendants[0], s, introLookup);
    break;
  default:
    s.s += '->[';
    mtn2.descendants.forEach((desc, i)=>{
      if (i > 0) {
        s.s += ',';
      }
      intro = introLookup[desc.node];
      mut = intro.mutation;
      node = intro.nodeIndex;
      s.s += `${NUC_LOOKUP[mut.to]}${node}`;
      addDescendants(desc, s, introLookup);
    });
    s.s += ']';
    break;
  }
};

const assembleAlleleHist = (introductions: Introduction[], mutTree: MutTreeNode[]) : string => {
  const introLookup: {[_:number]: Introduction} = {};
  introductions.forEach(intro=>introLookup[intro.nodeIndex] = intro);
  const allelePaths: string[] = mutTree.map((mtn)=>{
    const intro = introLookup[mtn.node];
    const mut = intro.mutation;
    const node = intro.nodeIndex;
    const actualS = `${NUC_LOOKUP[mut.from]}->${NUC_LOOKUP[mut.to]}${node}`;
    const s: StringWrap = {s: actualS};
    addDescendants(mtn, s, introLookup);
    return s.s;
  });
  return allelePaths.join('; ');
};



/* here, "same site" is a generalization that includes reversals and multiple introductions */
export const getSameSiteInterest = (tree: PhyloTree, treeIndex: number) : SameSiteIntroductions[] =>{
  const intros: Introduction[][] = gatherTreeMutations(tree);
  const sameSiteIntros = intros.filter(intro=>intro.length > 1).map(introductions=>{
    const site = introductions[0].mutation.site;
    const mutTree: MutTreeNode[] = getMutationTree(tree, introductions);
    const alleleHist = assembleAlleleHist(introductions, mutTree);
    return {site, introductions, alleleHist, treeIndex, tree: mutTree};
  });
  return sameSiteIntros;
}




export const gatherConsistentMutations = (treeMutations: SameSiteIntroductions[][]) : SameSiteIntroductionSupport[] =>{
  const sites: SameSiteIntroductionSupport[] = [];
  treeMutations.forEach((ssis: SameSiteIntroductions[])=>{
    ssis.forEach((ssi: SameSiteIntroductions)=>{
      const site = ssi.site;
      if (sites[site] === undefined) {
        const trees: SameSiteIntroductions[] = [];
        const percent = 0;
        sites[site] = {site, trees, percent};
      }
      sites[site].trees.push(ssi);
    });
  });
  const treeCount = treeMutations.length;
  sites.forEach((ssis)=>ssis.percent = ssis.trees.length / treeCount);
  return sites.filter(ssis=>!!ssis);
};




const gatherBaseTreeMutationsOfInterest = (tree: PhyloTree, all: {[name: string]: MutationOfInterest}, treeIndex: number)=> {
  /*
  start by organizing all the mutations by the site at which they occur
  */
  const nodeCounts = getNodeCounts(tree),
    siteIntroductions: Introduction[][] = gatherTreeMutations(tree),
    rootSequence: Uint8Array = tree.getRootSequence(),
    addToAll = (intro: Introduction)=>{
      const mutation = intro.mutation,
        nodeIndex = intro.nodeIndex,
        name = getMutationName(mutation),
        isApobecCtx = checkApobecCtx(mutation, tree.getRootSequence());
      let moi = all[name]
      if (!moi) {
        const treeCount = 0,
          confidence = 0,
          medianTipCount = 0,
          baseTipCounts: number[] = [],
          isApobec = 0;
        moi = {mutation, name, treeCount, confidence, medianTipCount, baseTipCounts, isApobec};
        all[name] = moi;
      }
      moi.treeCount++;
      if (isApobecCtx) moi.isApobec++;
      moi.baseTipCounts.push(nodeCounts[nodeIndex]);
    };
  let uniques: {[name:string]: Introduction};
  for (let site = 0; site < siteIntroductions.length; site++) {
    if (siteIntroductions[site]) {
      const intros: Introduction[] = siteIntroductions[site];
      if (intros.length === 1) {
        addToAll(intros[0]);
      } else {
        /*
        If there are multiple mutations at the same site,
        then we have either a reversal, multiple introductions,
        or same site mutations.

        Organize them each according to the
        allele switches
        */
        const fromAlleles: number[] = [],
          toAlleles: number[] = [],
          rootAllele: number = rootSequence[site];
        let fromCount = 0,
          toCount = 0,
          moic: FeatureOfInterest;
        uniques = {};
        intros.forEach(intro=>{
          const name = getMutationName(intro.mutation);
          if (!uniques[name] || uniques[name].mutation.time > intro.mutation.time) {
            uniques[name] = intro;
          }
          let allele = intro.mutation.from;
          if (!fromAlleles[allele]) {
            fromAlleles[allele] = 1;
            fromCount++;
          } else {
            fromAlleles[allele]++
          }
          allele = intro.mutation.to;
          if (!toAlleles[allele]) {
            toAlleles[allele] = 1;
            toCount++;
          } else {
            toAlleles[allele]++
          }
        });
        if (fromCount === 1) {
          if (toCount === 1) {
            // we have the same mutation occuring multiple times
            moic = FeatureOfInterest.MultipleIntroductions;
          } else {
            // we same site mutations
            moic = FeatureOfInterest.SameSite;
          }
        } else if (toAlleles[rootAllele] > 0) {
          /*
          something mutated back to the root allele
          so we have a reversal
          if we want to confirm which is the reversal,
          we can do something like  this:
              const from = intro.mutation.from;
              let found = false;
              for (let i = index + 1; i < intros.length && !found; i++) {
                const intro2 = intros[i];
                if (intro2.mutation.to === from) {
                  let ix = intro.nodeIndex;
                  while (ix >= 0 && !found) {
                    ix = tree.getParentIndexOf(ix);
                    found = ix === intro2.nodeIndex;
                  }
                  if (found) {
                    reversals.increment(intro2.mutation);
                  }
                }
              }
          */
          moic = FeatureOfInterest.Reversals;
          // if (fromCount > 2 ) {
          //   // we also have a same site mutation
          // }
        } else {
          // we have same site mutations
          moic = FeatureOfInterest.SameSite;
        }
        Object.values(uniques).forEach((intro: Introduction)=>{
          addToAll(intro);
          const name = getMutationName(intro.mutation),
            moi: MutationOfInterest = all[name];
          if (!moi.features) {
            moi.features = {};
          }
          if (!moi.features[moic]) {
            moi.features[moic] = {
              confidence : 0,
              introductions: []
            };
          }
          moi.features[moic].introductions.push({treeIndex, intros});
        });
      }
    }
  }
  Object.values(all).forEach((moi: MutationOfInterest)=>{
    const counts = moi.baseTipCounts;
    counts.sort(numericSort);
    const L = counts.length,
      half = Math.floor(L/2);
    moi.medianTipCount = L % 2 === 1 ? counts[half] : (counts[half-1] + counts[half])/2;
  })

}




/*
From this, we want to get
a list of every mutation
  how many trees does it appear in
  how many tips does it have across all trees
  is it a mutation of interest? these are
    reversals: the root genome has an allele, a mutation changes it, and then it changes back
    multiple introductions: the same site appears many times in the same tree
    same site mutation: the root allele mutates into different things at the same site
  for each of these, we want to know the number of trees it appears in

*/

export function getMccMutationsOfInterest(mcc: MccTree): MutationOfInterestSet {
  const treeCount = mcc.getNumBaseTrees();
  const mutationLookup: {[name: string]: MutationOfInterest} = {};
  for (let treeIndex = 0; treeIndex < treeCount; treeIndex++) {
    const tree = mcc.getBaseTree(treeIndex);
    gatherBaseTreeMutationsOfInterest(tree, mutationLookup, treeIndex);
  }
  const all = Object.values(mutationLookup);
  all.forEach(moi=>{
    moi.confidence = moi.treeCount / treeCount;
    if (moi.features) {
      Object.values(moi.features).forEach((id:InterestData)=>{
        id.confidence = id.introductions.length / treeCount;
      });
    }
  });
  const filerFOI = (foi: FeatureOfInterest)=>all.filter(moi=>moi.features && moi.features[foi]);
  const mois: MutationOfInterestSet = {
    [FeatureOfInterest.SameSite]: filerFOI(FeatureOfInterest.SameSite),
    [FeatureOfInterest.MultipleIntroductions]: filerFOI(FeatureOfInterest.MultipleIntroductions),
    [FeatureOfInterest.Reversals]: filerFOI(FeatureOfInterest.Reversals),
    all: all,
    treeCount: treeCount
  };
  return mois;
}


const numericSort = (a: number, b: number)=>a-b;