import { getMutationName, NUC_LOOKUP } from "../../constants";
import { Mutation } from "../../pythia/delphy_api";
import { MutationDistribution } from "../../pythia/mutationdistribution";

import { DisplayNode, nfc, UNSET } from "../common";
import { MATCH_CLASS, NO_MATCH_CLASS, NodeCallback, NodeComparisonData } from "./lineagescommon";
import { mutationPrevalenceThreshold } from "./nodecomparisonchartdata";


const UNSET_CHAR = "-";
const MUTATION_LIMIT = 30;

const MUTATION_TEMPLATE = document.querySelector("#subway .station") as HTMLDivElement;
MUTATION_TEMPLATE?.remove();

type MATCH_HANDLER_TYPE = (name: string)=>void;


class Track {
  startCode: string = UNSET_CHAR;
  endCode: string = UNSET_CHAR;
  line: HTMLDivElement;
  terminus: HTMLDivElement;
  signage: HTMLSpanElement;
  mutationCount: number = UNSET;
  label = "";
  mutationList: MutationDistribution[] = [];
  mutationDivs: HTMLDivElement[] = [];


  constructor(line: HTMLElement | null, matchHandler: MATCH_HANDLER_TYPE) {
    this.line = line as HTMLDivElement;
    this.terminus = this.line.querySelector(".terminus.exit") as HTMLDivElement;
    this.signage = this.line.querySelector(".transit .signage .count") as HTMLSpanElement;
    const stations = this.line.querySelector(".stations") as HTMLDivElement;
    for (let i = 0; i < MUTATION_LIMIT; i++) {
      const mutDiv = MUTATION_TEMPLATE.cloneNode(true) as HTMLDivElement;
      this.mutationDivs.push(mutDiv);
      stations.appendChild(mutDiv);
      mutDiv.addEventListener("pointerenter", ()=>{
        const mut = this.mutationList[i]?.mutation;
        if (mut) {
          const name = getMutationName(mut);
          matchHandler(name);
        }
      });
      mutDiv.addEventListener("pointerleave", ()=>matchHandler(''));
    }
  }

  set(startCode:string, endCode:string, mutations:MutationDistribution[]) {
    this.startCode = startCode;
    this.endCode = endCode;
    this.label = endCode === UNSET_CHAR ? '' : endCode.toUpperCase();
    this.mutationList = mutations;
    this.mutationCount = mutations.length;
  }

  render() {
    this.line.classList.remove(MATCH_CLASS);
    this.line.classList.remove(NO_MATCH_CLASS);
    this.line.setAttribute("data-from", this.startCode);
    this.line.setAttribute("data-to", this.endCode);
    this.terminus.textContent = this.label;
    this.signage.textContent = nfc(this.mutationCount);
    if (this.mutationCount > MUTATION_LIMIT) {
      this.mutationDivs.forEach(div=>div.classList.add("hidden"));
    } else {
      for (let i = 0; i < MUTATION_LIMIT; i++) {
        const mutDiv = this.mutationDivs[i];
        const mut = this.mutationList[i]?.mutation;
        if (mut) {
          (mutDiv.querySelector(".transfer.from") as HTMLSpanElement).textContent = NUC_LOOKUP[mut.from];
          (mutDiv.querySelector(".train") as HTMLSpanElement).textContent = `${mut.site}`;
          (mutDiv.querySelector(".transfer.to") as HTMLSpanElement).textContent = NUC_LOOKUP[mut.to];
          mutDiv.classList.remove("hidden");
          mutDiv.classList.remove(MATCH_CLASS);
          mutDiv.classList.remove(NO_MATCH_CLASS);
        } else {
          mutDiv.classList.add("hidden");
        }
      }
    }
  }

  handleMutationMatch(mutationName:string) {
    if (mutationName === '') {
      this.line.classList.remove(MATCH_CLASS);
      this.line.classList.remove(NO_MATCH_CLASS);
    } else {
      let anyMatches = false;
      this.mutationList.forEach((mut:MutationDistribution, i)=>{
        const name = getMutationName(mut.mutation);
        if (name === mutationName) {
          anyMatches = true;
          this.mutationDivs[i].classList.add(MATCH_CLASS);
          this.mutationDivs[i].classList.remove(NO_MATCH_CLASS);
        } else {
          this.mutationDivs[i].classList.remove(MATCH_CLASS);
          this.mutationDivs[i].classList.add(NO_MATCH_CLASS);
        }
      });
      if (anyMatches) {
        this.line.classList.add(MATCH_CLASS);
        this.line.classList.remove(NO_MATCH_CLASS);
      } else {
        this.line.classList.remove(MATCH_CLASS);
        this.line.classList.add(NO_MATCH_CLASS);
      }
    }

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
    const handleMut = (name:string)=>this.handleMutationMatch(name);
    this.centralLine = new Track(this.div.querySelector(".line.central"), handleMut);
    this.endLine = new Track(this.div.querySelector(".line.end"), handleMut);
    this.upperLine = new Track(this.div.querySelector(".line.upper"), handleMut);
    this.lowerLine = new Track(this.div.querySelector(".line.lower"), handleMut);
  }


  handleMutationMatch(mutationName:string) {
    [ this.centralLine,
      this.endLine,
      this.upperLine,
      this.lowerLine
    ].forEach((line:Track)=>line.handleMutationMatch(mutationName));
  }

  draw() {
    this.div.setAttribute("data-config", this.dataConfig);
    [this.centralLine, this.endLine, this.upperLine, this.lowerLine].forEach((line:Track)=>line.render());

  }

  setData(src: NodeComparisonData[], indexes: [number, number, number, number], nodeAIsUpper: boolean) {
    // console.debug(src.map(ncd=>ncd.nodePair.pairType));
    this.src = src;
    this.indexes = indexes;
    this.nodeAisUpper = nodeAIsUpper;

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
      if (nodeAIsUpper) {
        upperLabel = "a";
        lowerLabel = "b";
        upperMutations = getMutationsFor(indexes[DisplayNode.nodeA]);
        lowerMutations = getMutationsFor(indexes[DisplayNode.nodeB]);
      } else {
        upperLabel = "b";
        lowerLabel = "a";
        upperMutations = getMutationsFor(indexes[DisplayNode.nodeA]);
        lowerMutations = getMutationsFor(indexes[DisplayNode.nodeB]);
      }


    } else if (indexes[DisplayNode.nodeA] !== UNSET) {
      if (indexes[DisplayNode.nodeB] === UNSET) {
        this.dataConfig = "a";
        centerLabel = "a";
        centralMutations = getMutationsFor(indexes[DisplayNode.nodeA]);
      } else {
        /*
        are nodes 1 and 2 both descended from root,
        or is one the parent of the other?
        */
        const root = indexes[DisplayNode.root],
          nodeA = indexes[DisplayNode.nodeA],
          nodeB = indexes[DisplayNode.nodeB];
        let nodeAParent: number = UNSET,
          nodeBParent: number = UNSET;
        src.forEach((ncd: NodeComparisonData)=>{
          const pair = ncd.nodePair;
          if (pair.index2 === nodeA) nodeAParent = pair.index1;
          else if (pair.index2 === nodeB) nodeBParent = pair.index1;
        });
        if (nodeAParent === root) {
          if (nodeBParent === root) {
            if (nodeAIsUpper)  {
              this.dataConfig = "ab";
              upperLabel = "a";
              lowerLabel = "b";
              upperMutations = getMutationsFor(indexes[DisplayNode.nodeA]);
              lowerMutations = getMutationsFor(indexes[DisplayNode.nodeB]);
            } else {
              this.dataConfig = "ba";
              upperLabel = "b";
              lowerLabel = "a";
              upperMutations = getMutationsFor(indexes[DisplayNode.nodeB]);
              lowerMutations = getMutationsFor(indexes[DisplayNode.nodeA]);
            }
          } else if (nodeBParent === nodeA) {
            this.dataConfig = "a2b";
            centerLabel = "a";
            endLabel = "b";
            centralMutations = getMutationsFor(indexes[DisplayNode.nodeA]);
            endMutations = getMutationsFor(indexes[DisplayNode.nodeB]);
          } else {
            console.warn('the developer has unwarranted assumptions about node relations', nodeBParent, indexes);
          }
        } else if (nodeAParent === nodeB && nodeBParent === root) {
          this.dataConfig = "b2a";
          centerLabel = "b";
          endLabel = "a";
          centralMutations = getMutationsFor(indexes[DisplayNode.nodeB]);
          endMutations = getMutationsFor(indexes[DisplayNode.nodeA]);
        } else {
          console.warn('the developer has unwarranted assumptions about node relations', nodeAParent, nodeBParent, indexes);
        }
      }
    } else if (indexes[DisplayNode.nodeB] !== UNSET) {
      this.dataConfig = "b";
      centerLabel = "B";
      centralMutations = getMutationsFor(indexes[DisplayNode.nodeB]);
    }

    this.centralLine.set( "root", centerLabel, centralMutations);
    this.endLine.set(centerLabel, endLabel, endMutations);
    this.upperLine.set(centerLabel, upperLabel, upperMutations);
    this.lowerLine.set(centerLabel, lowerLabel, lowerMutations);

    requestAnimationFrame(()=>{
      this.draw();
    });

  }


  highlightNode(node: DisplayNode, mutation: Mutation|null) : void {
    console.log(`nodePairMutations.highlightNode does not handle mutations yet`, mutation);
    if (node !== this.highlightedNode) {
      this.highlightedNode = node;
      this.draw();
    }
  }


}