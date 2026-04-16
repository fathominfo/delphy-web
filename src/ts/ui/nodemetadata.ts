import { Tree, PhyloTree, SummaryTree } from '../pythia/delphy_api';
import { Metadata, MetadataRow } from './metadata';
import { isTip } from '../util/treeutils';
import { UNDEF } from './common';

export type FieldTipCount = {[name: string]: number};
export type NodeFieldData = {value: string, counts: FieldTipCount};
export type NodeMetadataValues = {[key: string]: NodeFieldData};

type IndexOptionsFnc = (index:number, options: string[][])=>string[];


type ColCount = [value: string, count: number];



export class ColumnSummary {
  values: {[key: string]: number};
  sorted: ColCount[];
  unique: number;

  constructor () {
    this.values = {};
    this.sorted = [];
    this.unique = 0;
  }

  increment(value: string) : void {
    if (!this.values[value]) {
      this.values[value] = 1;
    } else {
      this.values[value]++;
    }
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



export class NodeMetadata {

  metadata: Metadata;
  tree: Tree;
  /*  tipMetadataRow[treeTipIndex] = metadataRowIndex  */
  tipMetadataRow: number[];
  indicesRootToTip: number[];
  /* nodeValues[treeTipIndex] = metadata row */
  nodeValues: NodeFieldData[][];
  columnSummaries: ColumnSummary[];
  tipMetadata: MetadataRow[];


  constructor(metadata: Metadata, tree: SummaryTree, nameSource: PhyloTree) {
    this.metadata = metadata;
    this.tree = tree;
    /*
    we need the id from the fasta file, and only the phylo
    trees have acces to the fasta metadata line.
    We require that the fields in that line be bar delimited
    with the id column in the first position.
    */
    const nodeCount = nameSource.getSize(),
      tipCount = (nodeCount + 1) / 2,
      idColumn: string[] = metadata.ids,
      nodeValues = [],
      columns = metadata.header,
      columnCount = columns.length;
    this.columnSummaries = columns.map(()=>new ColumnSummary());
    this.tipMetadataRow = new Array(tipCount);
    this.tipMetadata = new Array(tipCount);

    /*
    tipMetadataRow will be indexed by tree tip position,
        with the value pointing to the corresponding row in the metadata file

    */
    let missingCount = 0;
    for (let i = 0; i < nodeCount; i++) {
      nodeValues[i] = Array(columnCount);
      if (isTip(nameSource, i)) {
        let tipName = nameSource.getNameOf(i).split('|')[0];
        /*
        The parser can return the '>' from
        the start of the fasta metadata line. This won't match
        the id column from the metadata, so check for it. [mark 250630]
        */
        if (tipName[0] === '>') {
          tipName = tipName.substring(1);
        }
        const mdIndex = idColumn.indexOf(tipName);
        this.tipMetadataRow[i] = mdIndex;
        const metadataRow = metadata.rows[mdIndex];
        if (metadataRow) {
          this.tipMetadata[i] = {};
          for (let c=0; c < columnCount; c++) {
            const field = columns[c],
              value = metadataRow[c],
              counts: FieldTipCount = {};
            counts[value] = 1;
            nodeValues[i][c] = {value, counts};
            if (value !== UNDEF) {
              this.tipMetadata[i][field] = value;
              this.columnSummaries[c].increment(value);
            }

          }
        } else {
        //   console.debug(`${tipName} note found in metadata (index ${mdIndex})`);
          missingCount++;
        }
      }
    }
    if (missingCount===0) {
      console.debug(`all tips have matches in the metadata file`);
    } else {
      console.debug(`${missingCount} tips in the tree did not have matching ids in the metadata`);
    }
    this.indicesRootToTip = [];
    this.nodeValues = nodeValues;
    this.columnSummaries.forEach(cs=>cs.setSorted());
    this.updateTree(tree);
  }


  updateTree(tree: Tree): void {
    this.tree = tree;
    /* a breadth first traversal of the tree */
    const indicesRootToTip : number[] = [tree.getRootIndex()];
    let i = 0;

    while (i < indicesRootToTip.length) {
      const index = indicesRootToTip[i],
        left = tree.getLeftChildIndexOf(index),
        right = tree.getRightChildIndexOf(index);
      if (left >= 0) {
        indicesRootToTip.push(left);
        indicesRootToTip.push(right);
      }
      i++;
    }
    this.indicesRootToTip = indicesRootToTip;
    /* reset the values for the inner nodes */
    const nodeCount = tree.getSize(),
      columnCount = this.metadata.header.length;
    for (let i = 0; i < nodeCount; i++) {
      if (!isTip(tree, i)) {
        this.nodeValues[i] = Array(columnCount);
      }
    }
    const header = this.metadata.header,
      idCol = this.metadata.idColumn;
    const getIndexOptions: IndexOptionsFnc = (index:number, options: string[][])=>{
      const leftIndex = tree.getLeftChildIndexOf(index),
        rightIndex = tree.getRightChildIndexOf(index),
        leftOpts = options[leftIndex] || [],
        rightOpts = options[rightIndex] || [],
        withDupes = leftOpts.concat(rightOpts);
      return withDupes;
    };

    header.forEach((_, i)=>{
      if (i !== idCol) {
        // console.debug(`setting inner nodes for '${_}'`);
        this.inheritUp(i, getIndexOptions);
      }
    });
  }


  inheritUp(column: number, getIndexOptions: IndexOptionsFnc) : void {
    // console.debug(column, this.metadata.header[column]);
    /*
    now set metadata values for each node.
    we are using a "parsimonious" ancestral state reconstruction:
    first set the state for the tips
    inner node possible states are chosen depending on the possible
    state of the two children:
    * if there's an overlap between the possible states, then use
      the intersection of those states
    * if there's no overlap between possible states, then use the
      union of those states
    * once you've assigned possible states from the bottom up, you
      can pick actual state top-down:
      * pick one of the possible states of the root at random
      * then for each node P, pick the state of child C as follows:
        * if the actual state at P is one of the possible states of C,
          pick that (no mutations!)
        * otherwise, pick one of the possible states of C at random
    */
    const {tree, indicesRootToTip, tipMetadataRow, nodeValues} = this,
      options: string[][] = [];
    let i: number;

    /* set what we can and build options from the bottom up */
    for (i = indicesRootToTip.length - 1; i >= 0; i--) {
      /* if is tip */
      const index = indicesRootToTip[i],
        mdIndex: number | undefined = tipMetadataRow[index];
      if (mdIndex !== undefined && nodeValues[index][column]) {
        const value = nodeValues[index][column].value;
        options[index] = [value];
      } else {
        const withDupes:string[] = getIndexOptions(index, options),
          /* this filters out dupes */
          uniques = withDupes.filter((n,i)=>withDupes.indexOf(n) === i),
          /* this finds only the dupes */
          overlaps = withDupes.filter((n, i)=>withDupes.indexOf(n) !== i);
        if (overlaps.length === 1) {
          this.nodeValues[index][column] = {value: overlaps[0], counts: {}};
        }
        if (overlaps.length > 0) {
          options[index] = overlaps;
        } else {
          options[index] = uniques;
        }
      }
    }
    /*
    now set state from the top down
    start with the root node
    */
    let index = indicesRootToTip[0];
    if (this.nodeValues[index] === undefined || this.nodeValues[index][column] === undefined) {
      const nodeOptions = options[index],
        rando = Math.floor(Math.random() * nodeOptions.length),
        value = nodeOptions[rando];
      this.nodeValues[index][column] = {value: value, counts: {}};
    }
    for (let i = 1; i < indicesRootToTip.length; i++) {
      index = indicesRootToTip[i];
      if (this.nodeValues[index][column] === undefined) {
        const parentIndex = tree.getParentIndexOf(index),
          parentVal = this.nodeValues[parentIndex][column].value,
          nodeOptions = options[index];
        let valIndex = nodeOptions.indexOf(parentVal),
          value: string;
        if (valIndex >= 0) {
          value = parentVal;
        } else {
          valIndex = Math.floor(Math.random() * nodeOptions.length);
          value = nodeOptions[valIndex];
        }
        this.nodeValues[index][column] = {value: value, counts: {}};
      }
    }

    /* now tally the tips with each metadata value upward from the tips */
    this.nodeValues.forEach((tipMetadata, tipIndex)=>{
      const value = tipMetadata[column].value;
      let parent = tree.getParentIndexOf(tipIndex);
      while (parent !== -1) {
        const tally = this.nodeValues[parent][column].counts;
        if (tally[value]) tally[value]++;
        else tally[value] = 1;
        parent = tree.getParentIndexOf(parent);
      }
    });
  }




  getNodeValues(field: string) : string[] {
    const column = this.metadata.header.indexOf(field);
    const values = this.nodeValues.map(row=>{
      if (row[column]) {
        return row[column].value;
      }
      return UNDEF;
    });
    return values;
  }

  getNodeTipCounts(field: string) : FieldTipCount[] {
    const column = this.metadata.header.indexOf(field);
    const values = this.nodeValues.map(row=>{
      if (row[column]) {
        return row[column].counts;
      }
      return {};
    });
    return values;
  }

  getNodeMetadata(nodeIndex: number) : NodeMetadataValues {
    const values: NodeMetadataValues = {},
      fields = this.nodeValues[nodeIndex],
      columns = this.metadata.header;
    for (let i = 0; i < columns.length; i++) {
      const key = columns[i],
        vals = fields[i];
      values[key] = vals;
    }
    return values;

  }

  getColumnSummary(field: string) : ColumnSummary {
    const index = this.metadata.header.indexOf(field),
      summ = this.columnSummaries[index];
    if (!summ) {
      throw new Error(`no field named '${field}' in metadata`);
    }
    return summ;
  }

}

