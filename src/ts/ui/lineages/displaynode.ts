import { getCSSValue, UNSET } from "../common";
import { Distribution } from "../distribution";
import { NodeMetadataValues } from "../nodemetadata";


const nodeTypeNames = ["Root", "MRCA", "A", "B"];
const nodeClassNames: string[] = ["root", "mrca", "nodeA", "nodeB"];

export class DisplayNode {
  index: number = UNSET;
  name = '';
  label = '';
  className = '';
  private nameIndex: number;
  generationsFromRoot: number = UNSET;
  isInferred = false;
  isRoot = false;
  isLocked = false;
  confidence: number = UNSET;
  childCount = 0;
  metadata: NodeMetadataValues | null = null;
  series: Distribution | null = null;
  times: number[] = [];


  // nameIndex currently is 0: root, 1: mrca, 2: nodeA, 3: nodeB
  constructor(nameIndex: number, index: number, generationsFromRoot: number, isInferred: boolean,
    isRoot: boolean, confidence: number, childCount: number,
    series: Distribution,
    metadata: NodeMetadataValues | null) {
    this.nameIndex = nameIndex;
    this.setData(index, generationsFromRoot, isInferred, isRoot,
      confidence, childCount, series, metadata);

    // this.name = String.fromCharCode(ASCII_BASE + nameIndex)
    // this.className = `node-${this.name}`;
    NUMS_IN_USE[this.nameIndex] = true;
  }

  setData(index: number, generationsFromRoot: number, isInferred: boolean,
    isRoot: boolean, confidence: number, childCount: number,
    series: Distribution,
    metadata: NodeMetadataValues | null) {
    this.index = index;
    this.name = nodeTypeNames[this.nameIndex] || '';
    this.label = this.name;
    this.className = nodeClassNames[this.nameIndex];
    this.generationsFromRoot = generationsFromRoot;
    this.isInferred = isInferred;
    this.isRoot = isRoot;
    this.isLocked = false; // <--- maybe this is a bad idea? [mark 261212]
    this.confidence = confidence;
    this.childCount = childCount;
    this.series = series;
    this.times = series.times;
    this.metadata = metadata;
  }

  copyFrom(other: DisplayNode) {
    this.index = other.index;
    this.name = other.name;
    this.label = other.label;
    this.className = other.className;
    this.generationsFromRoot = other.generationsFromRoot;
    this.isInferred = other.isInferred;
    this.isRoot = other.isRoot;
    this.isLocked = other.isLocked;
    this.confidence = other.confidence;
    this.childCount = other.childCount;
    this.series = other.series;
    this.times = other.times;
    this.metadata = other.metadata;
  }

  getStroke(): string {
    const strokeProp = `--${ this.name.toLowerCase() }-stroke`;
    return getCSSValue(strokeProp);
  }
  getFill(): string {
    const strokeProp = `--${ this.name.toLowerCase() }-fill`;
    return getCSSValue(strokeProp);
  }
  getTint(): string {
    const strokeProp = `--${ this.name.toLowerCase() }-tint`;
    return getCSSValue(strokeProp);
  }
  setIndex(index: number):void {
    this.index = index;
  }

  lock() { this.isLocked = true; }
  unlock() { this.isLocked = false; }

  deactivate(): void {
    NUMS_IN_USE[this.nameIndex] = false;
    this.unlock();
    this.index = UNSET;
  }
}



const MAX_NODE_COUNT = 26;
const NUMS_IN_USE: boolean[] = new Array(MAX_NODE_COUNT);
NUMS_IN_USE.fill(false);



const currentSelections: DisplayNode[] = []

const ASCII_BASE = 65;
let letterNum = 0;

const getNextNameNum = ():number=>{
  if (currentSelections.length >= MAX_NODE_COUNT) {
    alert(`Sorry, we only support up to ${ MAX_NODE_COUNT } selections`);
    throw new Error(`Sorry, we only support up to ${ MAX_NODE_COUNT } selections`);
  }
  while (NUMS_IN_USE[letterNum]) {
    letterNum++;
    letterNum %= 26;
  }
  return letterNum;
}


// export const addSelectedNode = (nodeIndex: number)=>{
//   const nameNum = getNextNameNum();
//   const node = new DisplayNode(nameNum, nodeIndex, false, false);
//   return node;
// }