import { UNSET } from '../ui/common';
import { PhyloTree, Mutation } from './delphy_api';

export const enum FeatureOfInterest {
  Reversal = "reversals",
  SameSite = "same_site",
  MultipleIntroduction = "multiple_introductions"
}



export type MutationOfInterest = {
  site: number,
  instances: Introduction[],
  features: Set<FeatureOfInterest>
};

export type Introduction = {
  mutation: Mutation;
  nodeIndex: number;
  affectedTipCount: number;
}


export type AggregateMOI = {
  site: number,
  featureSupport: {[_: string]: number}
};


function siteTallier(nodeIndex: number, m: Mutation,
  tipCount: number, candidates: MutationOfInterest[]) : void {
  if (isFinite(m.time)) {
    let siteIntroductions: MutationOfInterest = candidates[m.site];
    if (!siteIntroductions) {
      siteIntroductions = {site: m.site, instances: [], features: new Set()};
      candidates[m.site] = siteIntroductions;
    }
    siteIntroductions.instances.push({ nodeIndex: nodeIndex, mutation: m, affectedTipCount: tipCount });
  }
}

/*
For each site on the genome, track the mutations that occur at that site.
@return: an array indexed by site location. Each item in the array is an
  array of introductions, tracking the mutation and the node associated
  with it.
*/
function gatherTreeMutations(tree: PhyloTree, tipCounts: number[]): MutationOfInterest[] {
  let i: number;
  const candidates: MutationOfInterest[] = [],
    nodeCount = tree.getSize()
  for (i = 0; i < nodeCount; i++) {
    tree.forEachMutationOf(i, (m:Mutation)=>siteTallier(i, m, tipCounts[i], candidates));
  }
  return candidates;
}



function setFeatures(moi: MutationOfInterest, tree: PhyloTree) : void {
  const instances = moi.instances;
  const instanceLookup: Introduction[] = [];
  const ancestors: number[] = [];
  instances.forEach(inst=>{
    ancestors[inst.nodeIndex] = UNSET;
    instanceLookup[inst.nodeIndex] = inst;
  });
  instances.forEach((inst)=>{
    const index = inst.nodeIndex;
    let anc = tree.getParentIndexOf(index);
    while (anc !== UNSET && ancestors[anc] === undefined) {
      anc = tree.getParentIndexOf(anc);
    }
    ancestors[index] = anc;
  });
  const rooties: number[] = [];
  ancestors.forEach((anc, index)=>{
    if (anc === UNSET) {
      rooties.push(index);
    } else {
      /* is this a reversal or just another mutation? */
      const mut1 = instanceLookup[index].mutation;
      const mut2 = instanceLookup[anc].mutation;
      if (mut1.from === mut2.to && mut1.to === mut2.from) {
        moi.features.add(FeatureOfInterest.Reversal);
      } else {
        moi.features.add(FeatureOfInterest.SameSite);
      }
    }
  });
  if (rooties.length > 1) {
    /*
    do we have the same mutation introduced multiple times?
    Tally the times that the mutation.to appears.
    Note that the `.to` property on the mutation is an
    integer between 0 and 3 (inclusive).
    */
    const mutTos: number[] = new Array(4).fill(0);
    rooties.forEach(index=>{
      const toLetter = instanceLookup[index].mutation.to;
      mutTos[toLetter]++;
    });
    const foundMuts = mutTos.filter(count=>count>0);
    if (foundMuts.length > 1) {
      /* the same site mutated to different letters */
      moi.features.add(FeatureOfInterest.SameSite);
    }
    foundMuts.forEach((count)=>{
      if (count > 1) {
        /* the same mutation occured more than once */
        moi.features.add(FeatureOfInterest.MultipleIntroduction);
      }
    });
  }
}

export function gatherBaseTreeMutationsOfInterest(tree: PhyloTree, tipCounts: number[]
) : MutationOfInterest[] {
  const siteIntroductions: MutationOfInterest[] = gatherTreeMutations(tree, tipCounts);
  const multiIntros = siteIntroductions.filter(({instances})=>instances.length > 1);
  multiIntros.forEach(moi=>setFeatures(moi, tree));
  return multiIntros;
}


/* pass in pythia.mutationOfInterestHist.slice(kneeIndex) */
export function tallyMutationsOfInterest(treeMutations: MutationOfInterest[][]) : AggregateMOI[] {
  const sitesWithSupport: AggregateMOI[] = [];
  treeMutations.forEach((moiList: MutationOfInterest[])=>{
    moiList.forEach(moi=>{
      const site = moi.site;
      let featureSupport: {[_:string]: number};
      if (sitesWithSupport[site] === undefined) {
        featureSupport = {}
        sitesWithSupport[site] = {site, featureSupport};
      } else {
        featureSupport = sitesWithSupport[site].featureSupport;
      }
      moi.features.forEach(feet=>{
        if (featureSupport[feet] === undefined) {
          featureSupport[feet] = 1;
        } else {
          featureSupport[feet]++;
        }
      });
    });
  });
  return sitesWithSupport;
}