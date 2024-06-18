import { AmbSeqLetter } from './delphy/api';
import { Mutation, RealSeqLetter_A, RealSeqLetter_C, RealSeqLetter_G, RealSeqLetter_T } from './pythia/delphy_api';

export const RANDOM_SEED = 0; // generate a new unknown seed
// export const RANDOM_SEED = 937162211; // reproducible behavior

export const MAX_TREE_SNAPSHOTS = 50;
export const GENOME_LENGTH = 29891;
export const MU_FACTOR = 365 * 1e5;


export type TipsByNodeIndex = number[][];
export type MutationDistInfo = {times: number[], nodeIndices: number[]};

/* pct for each series indexed by tree, series, date */
export type BaseTreeSeriesType = number[][][];
export type OverlapTally = {index1: number, index2: number, count: number};
export type NodeDistributionType = {series: BaseTreeSeriesType, overlap: OverlapTally[]};


type geneProp = {[prop: string]: number|boolean|string};

export const GENE_POSITIONS: {[mutation_string: string]: geneProp} = {
  "5UTR" :  {"start": 0,     "end": 265,   "label": "5'", "aa": 89,   "untranslating" : true},
  "ORF1a":  {"start": 266,   "end": 13442, "label": "1a", "aa": 4392  },
  "ORF1b":  {"start": 13444, "end": 21555, "label": "1b", "aa": 2704  },
  "S":      {"start": 21563, "end": 25384, "label": "S", "aa": 1274  },
  "ORF3a":  {"start": 25393, "end": 26220, "label": "3a", "aa": 276   },
  "E":      {"start": 26245, "end": 26472, "label": "E", "aa": 76    },
  "M":      {"start": 26523, "end": 27191, "label": "M", "aa": 223   },
  "ORF6":   {"start": 27202, "end": 27387, "label": "6", "aa": 62    },
  "ORF7a":  {"start": 27394, "end": 27759, "label": "7a", "aa": 122   },
  "ORF7b":  {"start": 27756, "end": 27887, "label": "7b", "aa": 44    },
  "ORF8":   {"start": 27894, "end": 28259, "label": "8", "aa": 122   },
  "N":      {"start": 28274, "end": 29533, "label": "N", "aa": 420   },
  "ORF10":  {"start": 29558, "end": 29674, "label": "10", "aa": 39    },
  "3UTR":   {"start": 29675, "end": 29677, "label": "3'", "aa": 1,    "untranslating" : true},
  "Non-coding region" : {"start": 29676, "end": 29811, "label": "ncr", "untranslating" : true},
};


const NUC_LOOKUP:string[] = [];
const AMBI_NUC_LOOKUP :string[] = [];


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



const sortMutList = (a:Mutation, b:Mutation)=>a.site - b.site;
const compareMutationLists = (l1:Array<Mutation>, l2:Array<Mutation>)=>{
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


function getMutationName(mutation: Mutation):string {
  return `${NUC_LOOKUP[mutation.from]}${mutation.site + 1}${NUC_LOOKUP[mutation.to]}`;
}

function getMutationNameParts(mutation: Mutation | string): [string, string, string] {
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

function getAllele(alleleIndex: number): string {
  return NUC_LOOKUP[alleleIndex];
}

function siteLabelToIndex(siteLabel: number): number {
  const siteIndex = siteLabel - 1;
  return siteIndex;
}

function siteIndexToLabel(siteIndex: number): number {
  const siteLabel = siteIndex + 1;
  return siteLabel;
}


const mutationEquals = (m1: Mutation, m2: Mutation)=>m1.site === m2.site && m1.from === m2.from && m1.to === m2.to;

const NUM_ALLELES = 4;

export {NUC_LOOKUP, AMBI_NUC_LOOKUP, getMutationName, getMutationNameParts, sortMutList, compareMutationLists, siteIndexToLabel, siteLabelToIndex, mutationEquals, getAllele, NUM_ALLELES};


export type RunParamConfig = {
  stepsPerSample: number,
  mutationRate: number,
  apobecEnabled: boolean,
  siteRateHeterogeneityEnabled: boolean,
  mutationRateIsFixed: boolean
};

/* only works for simple objects that can be stringified (no functions, dom elements, etc.) */
export const copyDict = (obj:object)=>JSON.parse(JSON.stringify(obj));



export type CoreVersionInfo = {
  version: string,
  build: number,
  commit: string
};
