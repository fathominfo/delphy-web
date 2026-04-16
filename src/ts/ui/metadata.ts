import { UNDEF } from './common';
import { handleLine } from '../util/commaseparatedline';

type Row = string[];
export type MetadataRow = {[key:string]: string};


export class Metadata {
  filename: string;
  header: Row;
  rows: Row[];
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

    const lines = text.split('\n');
    const rows = [];
    while (lines.length) {
      const row = handleLine(lines, delimiter)
      rows.push(row.map(cleanup));
    }


    const header = rows.shift();
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

  }


  getFields(): string[] {
    return this.header.slice(0);
  }


  getFieldValue(tipId: string, field: string) : string {
    const rowIdex = this.ids.indexOf(tipId),
      colIndex = this.header.indexOf(field);
    return this.rows[rowIdex][colIndex];
  }

  getTipMetadata(tipId: string) : MetadataRow {
    const item : MetadataRow = {},
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

