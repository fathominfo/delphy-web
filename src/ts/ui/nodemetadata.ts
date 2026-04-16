import { Tree, PhyloTree, SummaryTree } from '../pythia/delphy_api';
import { Metadata, MetadataRow } from './metadata';
import { isTip } from '../util/treeutils';
import { UNDEF, UNSET } from './common';

export type FieldTipCount = {[value: string]: number};
export type MetadataTipTally = {[field: string]: FieldTipCount};
export type MetadataOptions = {[field: string]: string[]};
export type NodeFieldData = {value: string, counts: FieldTipCount};
export type NodeMetadataValues = {[key: string]: NodeFieldData};

type ColCount = [value: string, count: number];

/*
for a base tree, return an array of objects that provide
tallies for each metadata field.
For tips, the tallies will be simple, like
{
  field 1: {value: 1},
  field 2: {value: 1},
  ...
}
For inner nodes, we tally values of the tips under them:
{
  field 1: {value 1: #, value 2: #, value 3: #, ...},
  field 2: {value 1: #, value 2: #, value 3: #, ...},
  ...
}
*/
export type TreeMetadataCounts = NodeMetadataValues[];

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
      columns = metadata.header,
      columnCount = columns.length;
    this.nodeValues = [];
    this.columnSummaries = columns.map(()=>new ColumnSummary());
    this.tipMetadata = new Array(tipCount);

    /*
    tipMetadataRow will be indexed by tree tip position,
        with the value pointing to the corresponding row in the metadata file

    */
    let missingCount = 0;
    for (let i = 0; i < nodeCount; i++) {
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

        const metadataRow = metadata.rows[mdIndex];
        if (metadataRow) {
          this.tipMetadata[i] = {};
          for (let c=0; c < columnCount; c++) {
            const field = columns[c],
              value = metadataRow[c];
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
    this.columnSummaries.forEach(cs=>cs.setSorted());
    this.tree = tree;
    this.nodeValues = this.updateTree(tree);
  }


  updateTree(tree: Tree): NodeFieldData[][] {
    const nodeCount = tree.getSize(),
      columns = this.metadata.header,
      columnCount = columns.length;
    /*
    a breadth first traversal of the tree.
    we will along this list backwards, setting values
    as we go. This way, by the time we get to a parent
    node, we know that the data for the child nodes
    will have been set.
    */
    const indicesRootToTip: number[] = [tree.getRootIndex()];
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
    /*
    now set metadata values for each node.
    we are using a "parsimonious" ancestral state reconstruction:
    set options from the bottom up
    then choose from options from the top down
    */
    const tipTallies = this.tallyTips(tree);
    const options = this.gatherOptions(tree, indicesRootToTip);
    const nodeValues = this.pickOptions(tree, indicesRootToTip, options, tipTallies);
    return nodeValues;
  }

  gatherOptions(tree: Tree, indicesRootToTip: number[]) : MetadataOptions[] {
    const nodeCount = tree.getSize(),
      columns = this.metadata.header,
      tipMetadata = this.tipMetadata,
      options: MetadataOptions[] = new Array(nodeCount),
      idCol = this.metadata.idColumn;
    for (let i = indicesRootToTip.length - 1; i >= 0; i--) {
      const index = indicesRootToTip[i];
      const mo: MetadataOptions = {};
      if (isTip(tree, index)) {
        const tally = tipMetadata[index] || {};
        columns.forEach((field, c)=>{
          if (c !== idCol) {
            const value = tally[field];
            if (value !== undefined) {
              mo[field] = [value];
            } else {
              mo[field] = [];
            }
          }
        });
      } else {
        /*
        inner node possible states are chosen depending on the possible
        state of the two children:
        * if there's an overlap between the possible states, then use
          the intersection of those states
        * if there's no overlap between possible states, then use the
          union of those states
        */
        const leftIndex = tree.getLeftChildIndexOf(index),
          rightIndex = tree.getRightChildIndexOf(index),
          leftOpts = options[leftIndex],
          rightOpts = options[rightIndex];
        columns.forEach((field, c)=>{
          if (c !== idCol) {
            const leftFieldOpts = leftOpts[field] || [];
            const rightFieldOpts = rightOpts[field] || [];
            const withDupes = leftFieldOpts.concat(rightFieldOpts);
            withDupes.sort();
            const overlaps = withDupes.filter((value, i)=>value === withDupes[i-1]);
            if (overlaps.length === 0) {
              mo[field] = withDupes;
            } else {
              mo[field] = overlaps;
            }
          }
        });
      }
      options[index] = mo;
    }
    return options;
  }


  pickOptions(tree: Tree, indicesRootToTip: number[], options: MetadataOptions[], tipTallies: MetadataTipTally[]) : NodeFieldData[][] {
    const columns = this.metadata.header,
      idCol = this.metadata.idColumn;
    /* create an array of arrays */
    const nodeValues : NodeFieldData[][] = Array.from(indicesRootToTip, ()=>{
      const fieldValues: NodeFieldData[] = columns.map(()=>{return {value: '', counts: {}}});
      return fieldValues;
    });
    /*
    * once you've assigned possible states from the bottom up, you
      can pick actual state top-down:
      * pick one of the possible states of the root at random
      * then for each node P, pick the state of child C as follows:
        * if the actual state at P is one of the possible states of C,
          pick that (no mutations!)
        * otherwise, pick one of the possible states of C at random
    */
    let index = indicesRootToTip[0];
    let nodeOptions = options[index];
    let nodeFieldOptions: string[];
    let value: string;
    columns.forEach((column, c)=>{
      if (c !== idCol) {
        nodeFieldOptions = nodeOptions[column];
        if (nodeFieldOptions.length === 1) {
          value = nodeFieldOptions[0];
        } else {
          // value = getRandom(nodeFieldOptions);
          value = getWeightedRandom(nodeFieldOptions, tipTallies[index][column]);
        }
        nodeValues[index][c].value = value;
        nodeValues[index][c].counts = tipTallies[index][column];
      }
    });
    let parentIndex: number;
    let parentValues: NodeFieldData[];
    let parentValue: string;

    let valIndex: number;
    let tally: FieldTipCount;


    for (let i = 1; i < indicesRootToTip.length; i++) {
      index = indicesRootToTip[i];
      nodeOptions = options[index];
      parentIndex = tree.getParentIndexOf(index);
      parentValues = nodeValues[parentIndex];
      columns.forEach((column, c)=>{
        if (c !== idCol) {
          nodeFieldOptions = nodeOptions[column];
          parentValue = parentValues[c].value;
          valIndex = nodeFieldOptions.indexOf(parentValue);
          tally = tipTallies[index][column] || {};
          if (valIndex >= 0) {
            value = parentValue;
          } else if (nodeFieldOptions.length === 1) {
            value = nodeFieldOptions[0];
          } else {
            // value = getRandom(nodeFieldOptions);
            value = getWeightedRandom(nodeFieldOptions, tally);
          }
          nodeValues[index][c].value = value;
          nodeValues[index][c].counts = tally;
        }
      });
    }

    /* append the id to the tips */
    const idColName = columns[idCol];
    this.tipMetadata.forEach((md: MetadataRow, index: number)=>{
      const id = md[idColName];
      const nfd: NodeFieldData[] = nodeValues[index];
      nfd[idCol].value = id;
    })

    return nodeValues;
  }



  tallyTips(tree: Tree) : MetadataTipTally[] {
    const nodeCount = tree.getSize(),
      columns = this.metadata.header,
      tipMetadata = this.tipMetadata,
      tallies: MetadataTipTally[] = new Array(nodeCount),
      idCol = this.metadata.idColumn;
    for (let i = 0; i < nodeCount; i++) {
      tallies[i] = {};
    }
    const tallyField = (fmo: MetadataTipTally, field: string, value: string)=>{
      if (fmo[field] === undefined) {
        fmo[field] = {};
        fmo[field][value] = 1;
      } else if (fmo[field][value] === undefined) {
        fmo[field][value] = 1;
      } else {
        fmo[field][value] += 1;
      }
    }
    tipMetadata.forEach((md, index)=>{
      columns.forEach((field, c)=>{
        if (c !== idCol) {
          let value = md[field];
          if (value === undefined) {
            value = UNDEF;
          }
          tallyField(tallies[index], field, value);
          let parent = tree.getParentIndexOf(index);
          while (parent !== UNSET) {
            tallyField(tallies[parent], field, value);
            parent = tree.getParentIndexOf(parent);
          }
        }
      });
    });
    return tallies;
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

const getRandom = (options: string[]) : string => {
  const rando = Math.floor(Math.random() * options.length);
  return options[rando];
}

const getWeightedRandom = (options: string[], ftc: FieldTipCount) : string =>{
  if (options.length === 0) {
    return UNDEF;
  }
  const candidates = Object.entries(ftc).filter((entry)=>{
    const key: string = entry[0];
    return options.indexOf(key) >= 0;
  });
  let sum = 0;
  const runningTotals = candidates.map(([_value, count])=>{
    sum += count;
    return sum;
  });
  const rando = Math.random() * sum;
  let i = 0;
  while (runningTotals[i] < rando && i < runningTotals.length) {
    i++;
  }
  return candidates[i][0];

};