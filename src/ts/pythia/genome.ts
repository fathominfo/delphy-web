import { RealSeqLetter } from "../delphy/api";
import { nfc, UNSET } from "../ui/common";
import { Mutation, RealSeqLetter_A, RealSeqLetter_C, RealSeqLetter_G, RealSeqLetter_T } from "./delphy_api";


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

  getAAName(mutation: Mutation) : string | null {
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
      letters[codonPosition] = mutation.to;
      return toAA(letters);
    }
    return null;
  }
}


export const toAA = (letters:Uint8Array) : string => {
  const [i1, i2, i3] = letters;
  return AMINO_ACIDS[i1][i2][i3];
}


// export const RealSeqLetter_A = 0;
// export const RealSeqLetter_C = 1;
// export const RealSeqLetter_G = 2;
// export const RealSeqLetter_T = 3;

/* shorter names are nice here */
const A = RealSeqLetter_A;
const C = RealSeqLetter_C;
const G = RealSeqLetter_G;
const T = RealSeqLetter_T;


const AMINO_ACIDS: string[][][] = [];
for (let i = 0; i < 4; i++) {
  AMINO_ACIDS[i] = [];
  for (let j = 0; j < 4; j++) {
    AMINO_ACIDS[i][j] = [];
  }
}

AMINO_ACIDS[ A ][ A ][ A ] = 'lys'
AMINO_ACIDS[ A ][ A ][ C ] = 'asn'
AMINO_ACIDS[ A ][ A ][ G ] = 'lys'
AMINO_ACIDS[ A ][ A ][ T ] = 'asn'
AMINO_ACIDS[ A ][ C ][ A ] = 'thr'
AMINO_ACIDS[ A ][ C ][ C ] = 'thr'
AMINO_ACIDS[ A ][ C ][ G ] = 'thr'
AMINO_ACIDS[ A ][ C ][ T ] = 'thr'
AMINO_ACIDS[ A ][ G ][ A ] = 'arg'
AMINO_ACIDS[ A ][ G ][ C ] = 'ser'
AMINO_ACIDS[ A ][ G ][ G ] = 'arg'
AMINO_ACIDS[ A ][ G ][ T ] = 'ser'
AMINO_ACIDS[ A ][ T ][ A ] = 'ile'
AMINO_ACIDS[ A ][ T ][ C ] = 'ile'
AMINO_ACIDS[ A ][ T ][ G ] = 'met'
AMINO_ACIDS[ A ][ T ][ T ] = 'ile'

AMINO_ACIDS[ C ][ A ][ A ] = 'gln'
AMINO_ACIDS[ C ][ A ][ C ] = 'his'
AMINO_ACIDS[ C ][ A ][ G ] = 'gln'
AMINO_ACIDS[ C ][ A ][ T ] = 'his'
AMINO_ACIDS[ C ][ C ][ A ] = 'pro'
AMINO_ACIDS[ C ][ C ][ C ] = 'pro'
AMINO_ACIDS[ C ][ C ][ G ] = 'pro'
AMINO_ACIDS[ C ][ C ][ T ] = 'pro'
AMINO_ACIDS[ C ][ G ][ A ] = 'arg'
AMINO_ACIDS[ C ][ G ][ C ] = 'arg'
AMINO_ACIDS[ C ][ G ][ G ] = 'arg'
AMINO_ACIDS[ C ][ G ][ T ] = 'arg'
AMINO_ACIDS[ C ][ T ][ A ] = 'leu'
AMINO_ACIDS[ C ][ T ][ C ] = 'leu'
AMINO_ACIDS[ C ][ T ][ G ] = 'leu'
AMINO_ACIDS[ C ][ T ][ T ] = 'leu'

AMINO_ACIDS[ G ][ A ][ A ] = 'glu'
AMINO_ACIDS[ G ][ A ][ C ] = 'asp'
AMINO_ACIDS[ G ][ A ][ G ] = 'glu'
AMINO_ACIDS[ G ][ A ][ T ] = 'asp'
AMINO_ACIDS[ G ][ C ][ A ] = 'ala'
AMINO_ACIDS[ G ][ C ][ C ] = 'ala'
AMINO_ACIDS[ G ][ C ][ G ] = 'ala'
AMINO_ACIDS[ G ][ C ][ T ] = 'ala'
AMINO_ACIDS[ G ][ G ][ A ] = 'gly'
AMINO_ACIDS[ G ][ G ][ C ] = 'gly'
AMINO_ACIDS[ G ][ G ][ G ] = 'gly'
AMINO_ACIDS[ G ][ G ][ T ] = 'gly'
AMINO_ACIDS[ G ][ T ][ A ] = 'val'
AMINO_ACIDS[ G ][ T ][ C ] = 'val'
AMINO_ACIDS[ G ][ T ][ G ] = 'val'
AMINO_ACIDS[ G ][ T ][ T ] = 'val'

AMINO_ACIDS[ T ][ A ][ A ] = 'stop'
AMINO_ACIDS[ T ][ A ][ C ] = 'tyr'
AMINO_ACIDS[ T ][ A ][ G ] = 'stop'
AMINO_ACIDS[ T ][ A ][ T ] = 'tyr'
AMINO_ACIDS[ T ][ C ][ A ] = 'ser'
AMINO_ACIDS[ T ][ C ][ C ] = 'ser'
AMINO_ACIDS[ T ][ C ][ G ] = 'ser'
AMINO_ACIDS[ T ][ C ][ T ] = 'ser'
AMINO_ACIDS[ T ][ G ][ A ] = 'stop'
AMINO_ACIDS[ T ][ G ][ C ] = 'cys'
AMINO_ACIDS[ T ][ G ][ G ] = 'trp'
AMINO_ACIDS[ T ][ G ][ T ] = 'cys'
AMINO_ACIDS[ T ][ T ][ A ] = 'leu'
AMINO_ACIDS[ T ][ T ][ C ] = 'phe'
AMINO_ACIDS[ T ][ T ][ G ] = 'leu'
AMINO_ACIDS[ T ][ T ][ T ] = 'phe'

console.log(JSON.stringify(AMINO_ACIDS))