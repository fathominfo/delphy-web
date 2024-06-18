import { PhyloTree, MccTree, Mutation } from './delphy_api';
import { getMutationName } from '../constants';
import { isTip } from '../util/treeutils';
import { checkApobecCtx } from './pythia';

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