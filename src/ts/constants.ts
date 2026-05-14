import { AmbSeqLetter } from './delphy/api';
import { Mutation, RealSeqLetter_A, RealSeqLetter_C, RealSeqLetter_G, RealSeqLetter_T } from './pythia/delphy_api';

// Set to a nonzero value to reproduce a specific run
const RANDOM_SEED_OVERRIDE = 0;

export const RANDOM_SEED = RANDOM_SEED_OVERRIDE !== 0
  ? RANDOM_SEED_OVERRIDE
  : (crypto.getRandomValues(new Uint32Array(1))[0] || 1);  // avoid 0, which means "pick randomly" on the C++ side


export const STAGES = {
  "initialization" : 0,
  "selecting" : 1,
  "loading" : 2,
  "parsing" : 3,
  "loaded": 4,
  "resetting" : 5
};



export const MU_FACTOR = 365 * 1e5;
export const FINAL_POP_SIZE_FACTOR = 1e0 / 365.0;
export const POP_GROWTH_RATE_FACTOR = 365 * 1e0;


export type TipsByNodeIndex = number[][];
export type MutationDistInfo = {times: number[], nodeIndices: number[]};

/* pct for each series indexed by tree, series, date */
export type BaseTreeSeriesType = number[][][];
export type OverlapTally = {index1: number, index2: number, count: number};
export type NodeDistributionType = {series: BaseTreeSeriesType, overlap: OverlapTally[]};

export const NUC_LOOKUP:string[] = [];
export const AMBI_NUC_LOOKUP :string[] = [];

{
  NUC_LOOKUP[RealSeqLetter_A] = 'A';
  NUC_LOOKUP[RealSeqLetter_C] = 'C';
  NUC_LOOKUP[RealSeqLetter_G] = 'G';
  NUC_LOOKUP[RealSeqLetter_T] = 'T';

  AMBI_NUC_LOOKUP[AmbSeqLetter.A] = 'A';
  AMBI_NUC_LOOKUP[AmbSeqLetter.C] = 'C';
  AMBI_NUC_LOOKUP[AmbSeqLetter.G] = 'G';
  AMBI_NUC_LOOKUP[AmbSeqLetter.T] = 'T';
  for (let i = 0; i < 16; i++) {
    if (AMBI_NUC_LOOKUP[i] === undefined) {
      const l1 = i & 1,
        l2 = i & 2,
        l4 = i & 4,
        l8 = i & 8,
        s = (l1 ? `${AMBI_NUC_LOOKUP[1]  }|` : '')
           + (l2 ? `${AMBI_NUC_LOOKUP[2]  }|` : '')
           + (l4 ? `${AMBI_NUC_LOOKUP[4]  }|` : '')
           + (l8 ? `${AMBI_NUC_LOOKUP[8]  }|` : '');
      AMBI_NUC_LOOKUP[i] = s.substring(0, s.length - 1);
    }
  }
}



export const sortMutList = (a:Mutation, b:Mutation)=>a.site - b.site;
export const compareMutationLists = (l1:Array<Mutation>, l2:Array<Mutation>)=>{
  let i1 = 0,
    i2 = 0,
    count = 0;
  const L1 = l1.length,
    L2 = l2.length;
  while (i1 < L1 && i2 < L2) {
    if (i1 >= L1) {
      i2++;
      count++;
    } else if (i2 >= L2) {
      i1++;
      count++;
    } else {
      const m1 = l1[i1],
        m2 = l2[i2],
        s1 = m1.site,
        s2 = m2.site;
      if (s1 === s2) {
        if (m1.from !== m2.from || m1.to !== m2.to) {
          count++;
        }
        i1++;
        i2++;
      } else if (s1 < s2) {
        i1++;
        count++;
      } else if (s1 > s2) {
        i2++;
        count++;
      } else {
        console.warn('this should be unreachable');
        i1++;
        i2++;
      }
    }
  }
  return count;
};


export function getMutationName(mutation: Mutation):string {
  return `${NUC_LOOKUP[mutation.from]}${mutation.site + 1}${NUC_LOOKUP[mutation.to]}`;
}

export function getMutationNameParts(mutation: Mutation | string): [string, string, string] {
  let from = "", site = "", to = "";
  if (typeof mutation === "string") {
    from = mutation.charAt(0);
    site = mutation.slice(1, mutation.length - 1);
    to = mutation.charAt(mutation.length - 1);
  } else {
    from = NUC_LOOKUP[mutation.from];
    site = `${mutation.site + 1}`;
    to = NUC_LOOKUP[mutation.to];
  }
  return [from, site, to];
}

export function getAllele(alleleIndex: number): string {
  return NUC_LOOKUP[alleleIndex];
}

export function siteLabelToIndex(siteLabel: number): number {
  const siteIndex = siteLabel - 1;
  return siteIndex;
}

export function siteIndexToLabel(siteIndex: number): number {
  const siteLabel = siteIndex + 1;
  return siteLabel;
}


export const mutationEquals = (m1: Mutation, m2: Mutation)=>m1.site === m2.site && m1.from === m2.from && m1.to === m2.to;


/* only works for simple objects that can be stringified (no functions, dom elements, etc.) */
export const copyDict = (obj:object)=>structuredClone(obj);

export type CoreVersionInfo = {
  version: string,
  build: number,
  commit: string
};

export const noop = ()=>{};  // eslint-disable-line @typescript-eslint/no-empty-function

