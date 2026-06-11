import { NUC_LOOKUP } from "../constants";
import { RealSeqLetter } from "../delphy/api";
import { nfc, UNSET } from "../ui/common";
import { Mutation, RealSeqLetter_A, RealSeqLetter_C,
  RealSeqLetter_G, RealSeqLetter_T } from "./delphy_api";


/*

ref http://useast.ensembl.org/info/website/upload/gff3.html?

seqid - name of the chromosome or scaffold
source - name of the data source or program that generated this feature
type - type of feature. Must be a term or accession from the SOFA sequence ontology
start - Start position of the feature, with sequence numbering starting at 1.
end - End position of the feature, with sequence numbering starting at 1.
score - A floating point value.
strand - defined as + (forward) or - (reverse).
phase - One of '0', '1' or '2'. '0' indicates that the first base of the feature is the first base of a codon, '1' that the second base is the first base of a codon, and so on..
attributes - A semicolon-separated list of tag-value pairs, providing additional information about each feature. Some of these tags are predefined, e.g. ID, Name, Alias, Parent - see the GFF documentation for more details.

A note for those of us who know more about programming than DNA and RNA:
Regarding `phase`: not every feature in the gene starts with a complete
codon. Some exons need to be joined with other exons in order to make a
complete protein. For these features, we'll need to skip the first one
or two letters before assigning amino acids.

I found this page helpful: https://www.news-medical.net/life-sciences/What-are-introns-and-exons.aspx

*/

const GFF3_DELIMITER = '\t';
const LIKELY_NAME_FIELDS = new Set(["name", "gene", "gene_name"]);
const MINIMUM_CHAR_COUNT_TO_HAVE_9_COLUMNS = 17;

type RefSeqConfig = {
  taxon: number,
  abbrev: string,
  name: string,
  accession: string,
  sequence: string,
  gff_path: string
};

type RefSeqConfigWithSegment = {
  taxon: number,
  abbrev: string,
  name: string,
  accession: string,
  sequence: string,
  gff_path: string,
  segment: string
};


let refSeqs: {[_:string] : RefSeqConfig | RefSeqConfigWithSegment} = {};


export enum Strand {
  FORWARD = 1,
  REVERSE = 2
}

export class Feature {
  featureType = '';
  start: number = UNSET;
  end: number = UNSET;
  strand: Strand = Strand.FORWARD;
  phase = 0;
  name = '';

  fromGff3(gff3Line: string) : Feature {
    // console.log(`parsing line "${gff3Line}"`)
    const tokens = gff3Line.trim().split(GFF3_DELIMITER);
    this.featureType = tokens[2];
    /* in gff3, sequences are `1` indexed, but we'll want to have them 0 indexed */
    this.start = parseInt(tokens[3]) - 1;
    this.end = parseInt(tokens[4]) - 1;
    this.strand = tokens[6] === '-' ? Strand.REVERSE : Strand.FORWARD;
    this.phase = parseInt(tokens[7]) || 0;
    /* look for something nameworthy among the attributes */
    let name = '';
    tokens[8].split(';').forEach((attribute)=>{
      const [key, value] = attribute.split('=');
      if (LIKELY_NAME_FIELDS.has(key.toLowerCase()) && name === '') {
        name = value;
      }
    });
    this.name = name;
    return this;
  }

  getReadableStart() : string {
    return nfc(this.start + 1);
  }

  getReadableEnd() : string {
    return nfc(this.end + 1);
  }

  getReadableStrand() : string {
    return this.strand === Strand.REVERSE ? '-' : '+';
  }

  getReadablePhase() : string {
    return `${this.phase}`;
  }

}



export type AAMutation = {
  mutation: Mutation;
  from: string;
  to: string;
  protein: string;
  position: number;
  codon: RealSeqLetter[];
  isSynonymous: boolean;
  label: string;
};


export class Genome {
  fileName = '';
  features: Feature[] = [];
  refSequence: Uint8Array = new Uint8Array;

  constructor(fileName:string) {
    this.fileName = fileName;
  }

  ready() : boolean {
    return this.refSequence.length > 0;
  }

  fromGff3(gff3: string) : Genome {
    this.features.length = 0;
    const lines = gff3.split('\n');
    lines.forEach(line=>{
      if (line.charAt(0) !== '#' && line.length > MINIMUM_CHAR_COUNT_TO_HAVE_9_COLUMNS) {
        const feature = new Feature().fromGff3(line);
        this.features.push(feature);
      }
    });
    return this;
  }

  initRefSequence(seq: string) : void {
    let letter: string;
    let nuc: RealSeqLetter = RealSeqLetter_A; // init to something
    this.refSequence = new Uint8Array(seq.length);
    for (let c = 0; c < seq.length; c++) {
      letter = seq.charAt(c).toLowerCase();
      switch (letter) {
      case 'a': nuc = RealSeqLetter_A; break;
      case 'c': nuc = RealSeqLetter_C; break;
      case 'g': nuc = RealSeqLetter_G; break;
      case 't': nuc = RealSeqLetter_T; break;
      }
      this.refSequence[c] = nuc;
    }
  }

  getAAData(mutation: Mutation) : AAMutation | null {
    if (!this.ready()) {
      return null;
    }
    /*
    what coding region is it in?
    SCV2 is a simple case
    */
    const site = mutation.site;
    const feature = this.features.filter(f=>f.start <= site && f.end >= site)[0];
    if (feature) {
      /* get the codon */
      const genePos = site - feature.start;
      const codonStart = Math.floor(genePos / 3) * 3;
      const letters = this.refSequence.slice(codonStart, codonStart + 3);
      const codonPosition = genePos % 3;
      const fromAA = getAAName(letters);
      letters[codonPosition] = mutation.to;
      const toAA = getAAName(letters);
      const codon: RealSeqLetter[] = [];
      const isSynonymous = fromAA === toAA;
      letters.forEach(l=>codon.push(l));
      let label = `${feature.name}:${fromAA}${codonPosition}${toAA}`;
      if (isSynonymous) {
        label += `(${NUC_LOOKUP[mutation.from]}->${NUC_LOOKUP[mutation.to]})`;
      }
      const aaData = {
        mutation: mutation,
        from: fromAA,
        to: toAA,
        protein: feature.name,
        position: codonPosition,
        codon: codon,
        label: label,
        isSynonymous: isSynonymous
      };
      return aaData;
    }
    return null;
  }

}

export const getAAName = (letters:Uint8Array) : string => {
  const [i1, i2, i3] = letters;
  return AMINO_ACIDS[i1][i2][i3];
}

/*
shorter names are nice here
We're taking advantage of the values of the
RealSeqLetters, using them as indices
in our arrays. As defined in `delphy_api`:

  RealSeqLetter_A = 0
  RealSeqLetter_C = 1
  RealSeqLetter_G = 2
  RealSeqLetter_T = 3

*/
const A = RealSeqLetter_A;
const C = RealSeqLetter_C;
const G = RealSeqLetter_G;
const T = RealSeqLetter_T;

const AA_ABBREV_LOOKUP:{[_:string]: string} = {}
const AA_NAME_LOOKUP:{[_:string]: string} = {};

const AMINO_ACIDS: string[][][] = [];
for (let i = 0; i < 4; i++) {
  AMINO_ACIDS[i] = [];
  for (let j = 0; j < 4; j++) {
    AMINO_ACIDS[i][j] = [];
  }
}

const toIndex = (letter:string) : number => {
  let n = UNSET;
  switch (letter) {
  case 'A': n = A; break;
  case 'C': n = C; break;
  case 'G': n = G; break;
  case 'T': n = T; break;
  }
  return n;
}

fetch("./assets/data/aa.tsv").then(req=>req.text()).then(tsv=>{
  const lines = tsv.split('\n');
  lines.forEach(line=>{
    if (line.length > 0) {
      const [codon, name, abbrev, letter] = line.split('\t');
      const i1 = toIndex(codon.charAt(0));
      const i2 = toIndex(codon.charAt(1));
      const i3 = toIndex(codon.charAt(2));
      // console.log(codon, i1, i2, i3);
      AMINO_ACIDS[ i1 ][ i2 ][ i3 ] = letter;
      AA_ABBREV_LOOKUP[letter] = abbrev;
      AA_NAME_LOOKUP[letter] = name;
    }
  });
  // console.log(AMINO_ACIDS);
});

fetch("./assets/data/reference_sequences.json").then(req=>req.json()).then(data=>{
  refSeqs = {};
  data.forEach((conf: RefSeqConfig | RefSeqConfigWithSegment)=>{
    refSeqs[conf.accession] = conf;
  });
});


export type RefSequenceMatch = {
  config: RefSeqConfig | RefSeqConfigWithSegment | null,
  score: number
};


export const findRefSequenceCandidates = (sequence: string) : (RefSeqConfig | RefSeqConfigWithSegment)[] => {
  const L = sequence.length;
  const candidates = Object.values(refSeqs).filter((conf: RefSeqConfig | RefSeqConfigWithSegment)=>{
    return conf.sequence.length === L;
  });
  return candidates;
};

export const findMatchingRefSequence = (sequence: string) : RefSequenceMatch => {
  /*


  TODO:
  this scoring system is completely naive, and does not account for
  any shifting or deleting. It merely sums up mismatched letters at
  the exact same positions.


  */
  let bestScore: [number, string, string][] | null = null;
  let bestCandidate = UNSET;
  const L = sequence.length;
  const candidates = findRefSequenceCandidates(sequence);
  candidates.forEach((conf: RefSeqConfig | RefSeqConfigWithSegment, n: number)=>{
    const seq = conf.sequence;
    const misMatches: [number, string, string][] = [];
    for (let i = 0; i < L; i++) {
      if (sequence.charAt(i) !== seq.charAt(i)) misMatches.push([i, sequence.charAt(i), seq.charAt(i)]);
    }
    if (bestScore === null || (misMatches.length < bestScore.length)) {
      bestCandidate = n;
      bestScore = misMatches;
    }
  });
  let config: RefSeqConfig | RefSeqConfigWithSegment | null = null;
  if (bestScore !== null) {
    bestScore = bestScore as [number, string, string][];
    config = candidates[bestCandidate];
    console.log(`best candidate has ${bestScore.length} mismatched nucleotides`, config);
    let L = bestScore.length;
    if (L > 10) {
      console.debug(`     showing first 10 of ${L}:`);
      L = 10;
    }
    for (let i = 0; i < L; i++) {
      const [index, c1, c2] = bestScore[i];
      console.debug(`     ${index}: ${c1} != ${c2}`);
    }
  }
  const score = bestScore === null ? UNSET : bestScore.length;
  return { config, score };
};