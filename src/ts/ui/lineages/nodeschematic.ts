import { MutationDistribution } from "../../pythia/mutationdistribution";

import { DisplayNode, nfc, UNSET } from "../common";
import { NodeCallback, NodeComparisonData } from "./lineagescommon";
import { mutationPrevalenceThreshold } from "./nodecomparisonchartdata";


const UNSET_CHAR = "-";


class Track {
  startCode: string = UNSET_CHAR;
  endCode: string = UNSET_CHAR;
  line: HTMLDivElement;
  terminus: HTMLDivElement;
  signage: HTMLSpanElement;
  mutationCount: number = UNSET;
  label = "";
  mutationLists: MutationDistribution[] = [];

  constructor(line: HTMLElement | null) {
    this.line = line as HTMLDivElement;
    this.terminus = this.line.querySelector(".terminus.exit") as HTMLDivElement;
    this.signage = this.line.querySelector(".transit .signage .count") as HTMLSpanElement;
  }

  set(startCode:string, endCode:string, mutations:MutationDistribution[]) {
    this.startCode = startCode;
    this.endCode = endCode;
    this.label = endCode === UNSET_CHAR ? '' : endCode.toUpperCase();
    this.mutationLists = mutations;
    this.mutationCount = mutations.length;
  }

  render() {
    this.line.setAttribute("data-from", this.startCode);
    this.line.setAttribute("data-to", this.endCode);
    this.terminus.textContent = this.label;
    this.signage.textContent = nfc(this.mutationCount);
  }

}


/*
this draws a simple schematic to show the relations
between nodes in the tree. The current intent is that
there is only one of these.
*/
export class NodeSchematic {
  hasMRCA: boolean;
  highlightedNode: DisplayNode | typeof UNSET;
  nodeHighlightCallback: NodeCallback;
  src: NodeComparisonData[] = [];
  indexes: [number, number, number, number] = [UNSET, UNSET, UNSET, UNSET];
  dataConfig: string;
  div: HTMLDivElement;
  centralLine: Track;
  endLine: Track;
  upperLine: Track;
  lowerLine: Track;
  nodeAisUpper = true;

  constructor(nodeHighlightCallback: NodeCallback) {
    this.hasMRCA = false;
    this.highlightedNode = UNSET;
    this.nodeHighlightCallback = nodeHighlightCallback;
    this.dataConfig = "root";
    this.div = document.querySelector("#subway") as HTMLDivElement;
    this.centralLine = new Track(this.div.querySelector(".line.central"));
    this.endLine = new Track(this.div.querySelector(".line.end"));
    this.upperLine = new Track(this.div.querySelector(".line.upper"));
    this.lowerLine = new Track(this.div.querySelector(".line.lower"));
  }


  setLabelValue(div: HTMLDivElement, code: string): void {
    const label = code === UNSET_CHAR ? '' : code.toUpperCase();
    (div.querySelector(".terminus.exit") as HTMLDivElement).textContent = label;
  }

  draw() {
    this.div.setAttribute("data-config", this.dataConfig);
    [this.centralLine, this.endLine, this.upperLine, this.lowerLine].forEach((line:Track)=>line.render());

  }

  setData(src: NodeComparisonData[], indexes: [number, number, number, number], node1IsUpper: boolean) {
    // console.debug(src.map(ncd=>ncd.nodePair.pairType));
    this.src = src;
    this.indexes = indexes;
    this.nodeAisUpper = node1IsUpper;



    const getMutationsFor = (nodeIndex: number)=>{
      const data = src.filter(ncd=>ncd.nodePair.index2 === nodeIndex)[0],
        muts = !data? []: data.nodePair.mutations.filter(md => md.getConfidence() >= mutationPrevalenceThreshold);
      return muts;
    }


    this.dataConfig = "root";
    let centerLabel = UNSET_CHAR;
    let endLabel = UNSET_CHAR;
    let upperLabel = UNSET_CHAR;
    let lowerLabel = UNSET_CHAR;

    let centralMutations: MutationDistribution[] = [];
    let endMutations: MutationDistribution[] = [];
    let upperMutations: MutationDistribution[] = [];
    let lowerMutations: MutationDistribution[] = [];

    if (indexes[DisplayNode.mrca] !== UNSET) {
      this.dataConfig = "mrca";
      centerLabel = "mrca";
      centralMutations = getMutationsFor(indexes[DisplayNode.mrca]);
      if (node1IsUpper) {
        upperLabel = "a";
        lowerLabel = "b";
        upperMutations = getMutationsFor(indexes[DisplayNode.node1]);
        lowerMutations = getMutationsFor(indexes[DisplayNode.node2]);
      } else {
        upperLabel = "b";
        lowerLabel = "a";
        upperMutations = getMutationsFor(indexes[DisplayNode.node1]);
        lowerMutations = getMutationsFor(indexes[DisplayNode.node2]);
      }


    } else if (indexes[DisplayNode.node1] !== UNSET) {
      if (indexes[DisplayNode.node2] === UNSET) {
        this.dataConfig = "a";
        centerLabel = "a";
        centralMutations = getMutationsFor(indexes[DisplayNode.node1]);
      } else {
        /*
        are nodes 1 and 2 both descended from root,
        or is one the parent of the other?
        */
        const root = indexes[DisplayNode.root],
          node1 = indexes[DisplayNode.node1],
          node2 = indexes[DisplayNode.node2];
        let node1Parent: number = UNSET,
          node2Parent: number = UNSET;
        src.forEach((ncd: NodeComparisonData)=>{
          const pair = ncd.nodePair;
          if (pair.index2 === node1) node1Parent = pair.index1;
          else if (pair.index2 === node2) node2Parent = pair.index1;
        });
        if (node1Parent === root) {
          if (node2Parent === root) {
            if (node1IsUpper)  {
              this.dataConfig = "ab";
              upperLabel = "a";
              lowerLabel = "b";
              upperMutations = getMutationsFor(indexes[DisplayNode.node1]);
              lowerMutations = getMutationsFor(indexes[DisplayNode.node2]);
            } else {
              this.dataConfig = "ba";
              upperLabel = "b";
              lowerLabel = "a";
              upperMutations = getMutationsFor(indexes[DisplayNode.node2]);
              lowerMutations = getMutationsFor(indexes[DisplayNode.node1]);
            }
          } else if (node2Parent === node1) {
            this.dataConfig = "a2b";
            centerLabel = "a";
            endLabel = "b";
            centralMutations = getMutationsFor(indexes[DisplayNode.node1]);
            endMutations = getMutationsFor(indexes[DisplayNode.node2]);
          } else {
            console.warn('the developer has unwarranted assumptions about node relations', node2Parent, indexes);
          }
        } else if (node1Parent === node2 && node2Parent === root) {
          this.dataConfig = "b2a";
          centerLabel = "b";
          endLabel = "a";
          centralMutations = getMutationsFor(indexes[DisplayNode.node2]);
          endMutations = getMutationsFor(indexes[DisplayNode.node1]);
        } else {
          console.warn('the developer has unwarranted assumptions about node relations', node1Parent, node2Parent, indexes);
        }
      }
    } else if (indexes[DisplayNode.node2] !== UNSET) {
      this.dataConfig = "b";
      centerLabel = "B";
      centralMutations = getMutationsFor(indexes[DisplayNode.node2]);
    }

    this.centralLine.set( "root", centerLabel, centralMutations);
    this.endLine.set(centerLabel, endLabel, endMutations);
    this.upperLine.set(centerLabel, upperLabel, upperMutations);
    this.lowerLine.set(centerLabel, lowerLabel, lowerMutations);

    requestAnimationFrame(()=>{
      this.draw();
    });

  }


  highlightNode(node: DisplayNode | typeof UNSET) : void {
    if (node !== this.highlightedNode) {
      this.highlightedNode = node;
      this.draw();
    }
  }


}