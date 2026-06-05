import { UNSET } from "../ui/common";


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
    this.start = parseInt(tokens[3]);
    this.end = parseInt(tokens[4]);
    this.strand = tokens[6] === '-' ? Strand.REVERSE : Strand.FORWARD;
    this.phase = parseInt(tokens[7]);
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
}

export class Genome {
  features: Feature[] = [];
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
}
