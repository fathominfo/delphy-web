import { UNDEF } from './common';
import { NodeMetadata } from './nodemetadata';

type Row = string[];
type ColCount = [value: string, count: number];
type MetadataItem = {[key:string]: string};


export class ColumnSummary {
  values: {[key: string]: number};
  sorted: ColCount[];
  unique: number;

  constructor () {
    this.values = {};
    this.sorted = [];
    this.unique = 0;
  }

  initValue(value: string): void {
    this.values[value] = 0;
  }

  add(value: string): void {
    this.values[value]++;
  }

  setSorted(): void {
    this.sorted = Object.entries(this.values);
    this.sorted.sort(colCountSort);
    this.unique = this.sorted.length;
  }
}

function colCountSort(a:ColCount, b:ColCount): number {
  let diff = b[1] - a[1];
  if (a[0] === UNDEF && b[0] !== UNDEF) {
    diff = 1;
  } else if (b[0] === UNDEF) {
    diff = -1;
  } else if (diff === 0) {
    diff = b[0] < a[0] ? 1 : -1;
  }
  return diff;
}


export class Metadata {
  filename: string;
  header: Row;
  rows: Row[];
  columnSummaries: ColumnSummary[];
  idColumn: number;
  ids: string[];
  delimiter: string;
  sourceData: string;

  constructor(filename: string, text:string, delimiter:string) {
    this.filename = filename;
    this.sourceData = text;
    this.delimiter = delimiter;
    this.idColumn = -1;
    const cleanup = (value:string|undefined|null)=>{
      if (value === undefined
        || value === null
        || value === ''
        || value.toLowerCase() === 'noknown'
        || value.toLowerCase() === 'none') {
        return UNDEF;
      }
      return value;
    };
    const rows = text.split('\n').map(line=>line.split(delimiter).map(cleanup)),
      header = rows.shift();
    if (!header) {
      throw new Error("could not parse the metadata file");
    }
    const columnCount = header.length;
    for (let i = 0; i < columnCount; i++) {
      if (header[i].toLowerCase() === 'id' || header[i].toLowerCase() === 'accession') {
        this.idColumn = i;
      }
    }
    if (this.idColumn === -1) {
      alert("One column in the metadata file must be named 'id'");
      throw new Error("one column in the metadata file must be named 'id'");
    }
    rows.forEach(row=>{
      while (row.length < columnCount) {
        row.push(UNDEF);
      }
    });
    this.ids = rows.map(row=>row[this.idColumn]);
    this.header = header;
    this.rows = rows;
    this.columnSummaries = this.header.map(()=>new ColumnSummary());
  }

  summarize(nodeMetadata: NodeMetadata): void {
    /*
    track all the different values in the metadata file…
    */
    this.rows.forEach(row => {
      row.forEach((value, colNum) => {
        this.columnSummaries[colNum].initValue(value);
      });
    });
    /*
    …but only tally the ones that show up in the tree
    */
    nodeMetadata.tipMetadataRow.forEach((metadataRowIndex)=>{
      const row = this.rows[metadataRowIndex];
      if (row) {
        row.forEach((value, colNum) => {
          this.columnSummaries[colNum].add(value);
        });
      }
    });
    this.columnSummaries.forEach(cs=>cs.setSorted());
  }


  getFields(): string[] {
    return this.header.slice(0);
  }

  getColumnSummary(field: string): ColumnSummary {
    const index = this.header.indexOf(field),
      summ = this.columnSummaries[index];
    if (!summ) {
      throw new Error(`no field named '${field}' in metadata`);
    }
    return summ;
  }


  getFieldValue(tipId: string, field: string) : string {
    const rowIdex = this.ids.indexOf(tipId),
      colIndex = this.header.indexOf(field);
    return this.rows[rowIdex][colIndex];
  }

  getTipMetadata(tipId: string) : MetadataItem {
    const item : MetadataItem = {},
      rowIndex = this.ids.indexOf(tipId),
      row = this.rows[rowIndex];
    if (row) {
      this.header.forEach((name, index)=>{
        item[name] = row[index];
      });
    }
    return item;
  }


}

