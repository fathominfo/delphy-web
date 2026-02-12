import { getCSSValue, UNSET } from "../common";
import { Distribution } from "../distribution";
import { NodeMetadataValues } from "../nodemetadata";


const nodeTypeNames = ["Root", "MRCA", "A", "B"];
const nodeClassNames: string[] = ["root", "mrca", "nodeA", "nodeB"];

export class DisplayNode {
  name: string;
  label: string;
  index: number;
  private nameIndex: number;
  className: string;
  generationsFromRoot: number;
  isInferred: boolean;
  isRoot: boolean;
  isLocked: boolean;
  confidence: number;
  childCount: number;
  metadata: NodeMetadataValues | null;
  series: Distribution | null = null;
  times: number[] = [];


  // nameIndex currently is 0: root, 1: mrca, 2: nodeA, 3: nodeB
  constructor(nameIndex: number, generationsFromRoot: number, isInferred: boolean,
    isRoot: boolean, confidence: number, childCount: number,
    series: Distribution,
    metadata: NodeMetadataValues | null) {
    this.index = UNSET;
    this.nameIndex = nameIndex;
    this.name = nodeTypeNames[nameIndex];
    this.label = this.name;
    this.className = nodeClassNames[nameIndex];
    this.generationsFromRoot = generationsFromRoot;
    this.isInferred = isInferred;
    this.isRoot = isRoot;
    this.isLocked = false;
    this.confidence = confidence;
    this.childCount = childCount;
    this.series = series;
    this.times = series.times;
    this.metadata = metadata;

    // this.name = String.fromCharCode(ASCII_BASE + nameIndex)
    // this.className = `node-${this.name}`;
    NUMS_IN_USE[this.nameIndex] = true;
  }

  // setSeries(series: NodeDistribution | null): void {
  //   this.series = series;
  // }

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
  deactivate(): void {
    NUMS_IN_USE[this.nameIndex] = false;
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