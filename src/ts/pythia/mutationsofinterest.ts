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


export type TreeIntroduction = {
  mutation: Mutation;
  nodeIndex: number;
  affectedTipCount: number;
  treeIndex: number
};


export type AggregateMOI = {
  site: number,
  featureSupport: {[_: string]: number},
  instances: TreeIntroduction[]
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
    tree.forEachMutationOf(i, (m:Mutation)=>{
      siteTallier(i, m, tipCounts[i], candidates);
    });
  }
  return candidates;
}



function setFeatures(moi: MutationOfInterest, tree: PhyloTree) : void {
  const instances = moi.instances;
  const instanceLookup: Introduction[][] = [];
  const ancestors: number[] = [];
  instances.forEach(inst=>{
    ancestors[inst.nodeIndex] = UNSET;
    if (instanceLookup[inst.nodeIndex] === undefined) {
      instanceLookup[inst.nodeIndex] = [inst];
    } else {
      const nodeInstances = instanceLookup[inst.nodeIndex];
      nodeInstances.push(inst);
      nodeInstances.sort((a,b)=>a.mutation.time - b.mutation.time);
      for (let i = 1; i < nodeInstances.length; i++) {
        const startMut = nodeInstances[i - 1].mutation.from;
        const endMut = nodeInstances[i].mutation.to;
        if (startMut === endMut) {
          moi.features.add(FeatureOfInterest.Reversal);
        } else {
          moi.features.add(FeatureOfInterest.SameSite);
        }
      }
    }
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
      const nodeMutations = instanceLookup[index].map(inst=>inst.mutation);
      const ancMUtations = instanceLookup[anc].map(inst=>inst.mutation);
      const mut1 = ancMUtations[ancMUtations.length-1];
      const mut2 = nodeMutations[0];
      if (mut1.to === mut2.from && mut1.from === mut2.to) {
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
    Note that the `0 <= mutation.to <= 3`.
    */
    const mutTos: number[] = new Array(4).fill(0);
    rooties.forEach(index=>{
      const toLetter = instanceLookup[index][0].mutation.to;
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
  treeMutations.forEach((moiList: MutationOfInterest[], treeIndex)=>{
    moiList.forEach(moi=>{
      const site = moi.site;
      let featureSupport: {[_:string]: number};
      let instances: TreeIntroduction[];
      if (sitesWithSupport[site] === undefined) {
        featureSupport = {};
        instances = [];
        sitesWithSupport[site] = {site, featureSupport, instances};
      } else {
        featureSupport = sitesWithSupport[site].featureSupport;
        instances = sitesWithSupport[site].instances;
      }
      moi.features.forEach(feet=>{
        if (featureSupport[feet] === undefined) {
          featureSupport[feet] = 1;
        } else {
          featureSupport[feet]++;
        }
      });
      moi.instances.forEach(inst=>{
        const { mutation, nodeIndex, affectedTipCount } = inst;
        const treeInst : TreeIntroduction = {
          mutation, nodeIndex, affectedTipCount, treeIndex
        }
        instances.push(treeInst);
      });
    });
  });
  return sitesWithSupport.filter(agg=>!!agg);
}