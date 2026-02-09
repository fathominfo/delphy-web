import { DisplayNodeClass, UNSET, getPercentLabel } from '../common';
import { NodeMetadataValues } from '../nodemetadata';
import { DismissCallback, HoverCallback, NodeCallback } from './lineagescommon';

const METADATA_ITEM_TEMPLATE = document.querySelector(".node-metadata-item") as HTMLElement;
METADATA_ITEM_TEMPLATE.remove();

const DEBUG = false;

class NodeItem {
  div: HTMLDivElement;
  countSpan: HTMLSpanElement;
  confidenceSpan: HTMLSpanElement;
  nodeStats: HTMLElement;
  nodeIsTip: HTMLElement;
  tipIdSpan: HTMLElement;
  mdDiv: HTMLDivElement;
  nodeConfidence: number = UNSET;
  nodeChildCount: number = UNSET;
  locked = false;
  nodeMetadata: NodeMetadataValues | null = null;
  nodeIndex: number = UNSET;

  constructor(div: HTMLDivElement) {
    this.div = div;
    this.countSpan = div.querySelector('.node--tip-count') as HTMLSpanElement;
    this.confidenceSpan = div.querySelector('.node--confidence') as HTMLSpanElement;
    this.nodeStats = div.querySelector(".node-stats") as HTMLElement;
    this.nodeIsTip = div.querySelector(".tip-info") as HTMLElement;
    this.tipIdSpan = div.querySelector(".tip-id") as HTMLElement;
    this.mdDiv = div.querySelector(".node-metadata") as HTMLDivElement;
  }


  setData(nodeConfidence: number, nodeChildCount: number, locked: boolean,
    nodeMetadata: NodeMetadataValues | null, nodeIndex: number = UNSET) : void {
    this.nodeConfidence = nodeConfidence;
    this.nodeChildCount = nodeChildCount;
    this.locked = locked;
    this.nodeMetadata = nodeMetadata;
    this.nodeIndex = nodeIndex;
  }


  draw() {
    const {
      nodeConfidence,
      nodeChildCount,
      locked,
      nodeMetadata,
      nodeIndex,
      div,
      countSpan,
      confidenceSpan,
      nodeStats,
      nodeIsTip,
      tipIdSpan,
      mdDiv} = this;

    if (nodeIndex === UNSET) {
      this.div.classList.remove('active');
      this.div.classList.remove('locked');
      return;
    }
    div.classList.add('active');
    div.classList.toggle('locked', locked);
    const isTip = nodeChildCount === 1;
    div.classList.toggle("is-tip", isTip);

    if (!isTip) {
      nodeStats.classList.remove("hidden");
      nodeIsTip.classList.add("hidden");
      countSpan.innerText = `${nodeChildCount} tip${nodeChildCount === 1 ? '' : 's'}`;
      if (confidenceSpan) {
        confidenceSpan.innerText = `${getPercentLabel(nodeConfidence)}%`;
      }
    } else {
      nodeStats.classList.add("hidden");
      nodeIsTip.classList.remove("hidden");
      if (DEBUG) {
        tipIdSpan.innerText = `${nodeIndex} `;
      }
      if (nodeMetadata !== null) {
        if (nodeMetadata.id !== undefined) {
          tipIdSpan.innerText = `${nodeMetadata.id.value}`;
          tipIdSpan.title = nodeMetadata.id.value;
        } else if (nodeMetadata.accession !== undefined) {
          tipIdSpan.innerText = `${nodeMetadata.accession.value}`;
          tipIdSpan.title = nodeMetadata.accession.value;
        }
      }
    }


    if (nodeMetadata === null || (Object.keys(nodeMetadata).length === 1 && nodeMetadata.id !== undefined)) {
      mdDiv.classList.add('hidden');
    } else {
      mdDiv.classList.remove('hidden');

      mdDiv.querySelectorAll(".node-metadata-item").forEach(div=>div.remove());
      Object.entries(nodeMetadata).forEach(([key, value])=>{
        if (key.toLowerCase() !== 'id' && key.toLowerCase() !== 'accession'){
          const item = METADATA_ITEM_TEMPLATE.cloneNode(true) as HTMLElement;
          mdDiv.appendChild(item);

          const summary = item.querySelector(".pair--key-value") as HTMLElement;
          (summary.querySelector(".key") as HTMLElement).innerText = key;
          (summary.querySelector(".value") as HTMLElement).innerText = replaceUnknown(value.value);

          const valueCountPair = item.querySelector(".pair--value-count") as HTMLElement;
          item.querySelectorAll(".pair--value-count").forEach(el => el.remove());

          if (!isTip) {
            const tipCounts = item.querySelector(".tip-counts") as HTMLElement;
            Object.entries(value.counts).forEach(([val, count])=>{
              const pair = valueCountPair.cloneNode(true) as HTMLElement;
              tipCounts.appendChild(pair);
              if (val === value.value) {
                pair.classList.add("current");
              }
              (pair.querySelector(".value") as HTMLElement).innerText = replaceUnknown(val);
              (pair.querySelector(".count") as HTMLElement).innerText = `${count}`;
            });
          } else {
            const details = item.querySelector("details") as HTMLDetailsElement;
            details.classList.add("disabled");
          }
        }
      });
    }
  }

  clear() {
    this.nodeIndex = UNSET;
  }

  pushback() {
    this.div.classList.add('lowlight');
  }

  restore() {
    this.div.classList.remove('lowlight');
  }

}



export class NodeListDisplay {
  private container: HTMLElement;
  private rootDiv: NodeItem;
  private mrcaDiv: NodeItem;
  private nodeADiv: NodeItem;
  private nodeBDiv: NodeItem;

  constructor(dismissCallback: DismissCallback, nodeHighlightCallback: HoverCallback,
    nodeZoomCallback: NodeCallback) {
    this.container = document.querySelector("#lineages--node-list") as HTMLElement;

    const getDiv = (selector: string)=>{
      const div = document.querySelector(selector) as HTMLDivElement;
      if (!div) {
        throw new Error(`could not find display div for "${selector}"`);
      }
      return div;
    };
    this.rootDiv = new NodeItem(getDiv('.lineages--node-item.root'));
    this.mrcaDiv = new NodeItem(getDiv('.lineages--node-item.mrca'));
    this.nodeADiv = new NodeItem(getDiv('.lineages--node-item.nodeA'));
    this.nodeBDiv = new NodeItem(getDiv('.lineages--node-item.nodeB'));


    const bindDismiss = (div: HTMLDivElement, node: DisplayNodeClass)=>{
      const dismiss = div.querySelector(".node-dismiss") as HTMLButtonElement;
      if (!dismiss) {
        throw new Error('the div has nothing for dismissing');
      }
      dismiss.addEventListener('click', ()=>dismissCallback(node));
    }
    // const bindDiv = (div: HTMLDivElement, node: DisplayNodeClass) => {
    //   div.addEventListener('pointerenter', () => nodeHighlightCallback(node, UNSET, null));
    //   div.addEventListener('pointerleave', () => nodeHighlightCallback(UNSET, UNSET, null));
    //   div.addEventListener('click', () => nodeZoomCallback(node));
    // }
    // bindDismiss(this.nodeADiv.div, DisplayNode.nodeA);
    // bindDismiss(this.nodeBDiv.div, DisplayNode.nodeB);
    // bindDiv(this.rootDiv.div, DisplayNode.root);
    // bindDiv(this.mrcaDiv.div, DisplayNode.mrca);
    // bindDiv(this.nodeADiv.div, DisplayNode.nodeA);
    // bindDiv(this.nodeBDiv.div, DisplayNode.nodeB);
    // (document.querySelector("#lineages--node-list") as HTMLDivElement).addEventListener('pointerleave', ()=>nodeHighlightCallback(UNSET, UNSET, null));

  }


  setRoot(nodeConfidence: number, nodeChildCount: number, nodeMetadata: NodeMetadataValues | null, nodeIndex: number) : void {
    this.rootDiv.setData(nodeConfidence, nodeChildCount, false, nodeMetadata, nodeIndex);
  }

  setMRCA(nodeConfidence: number, nodeChildCount: number, locked = false, nodeMetadata: NodeMetadataValues | null, nodeIndex: number) : void {
    this.mrcaDiv.setData(nodeConfidence, nodeChildCount, locked, nodeMetadata, nodeIndex);
  }

  setNodeA(nodeConfidence: number, nodeChildCount: number, locked = false, nodeMetadata: NodeMetadataValues | null, nodeIndex: number) : void {
    this.nodeADiv.setData(nodeConfidence, nodeChildCount, locked, nodeMetadata, nodeIndex);
  }

  setNodeB(nodeConfidence: number, nodeChildCount: number, locked = false, nodeMetadata: NodeMetadataValues | null, nodeIndex: number) : void {
    this.nodeBDiv.setData(nodeConfidence, nodeChildCount, locked, nodeMetadata, nodeIndex);
  }

  clearMRCA(): void {
    this.mrcaDiv.clear();
  }

  clearNodeA(): void {
    this.nodeADiv.clear();
  }

  clearNodeB(): void {
    this.nodeBDiv.clear();
  }

  requestDraw() {
    requestAnimationFrame(()=>{
      [this.rootDiv, this.mrcaDiv, this.nodeADiv, this.nodeBDiv].forEach(div=>div.draw());
    });
  }

  highlightNode(node: DisplayNodeClass | null) : void {
    if (node === null) {
      this.rootDiv.restore();
      this.mrcaDiv.restore();
      this.nodeADiv.restore();
      this.nodeBDiv.restore();
    } else {
      this.rootDiv.pushback();
      this.mrcaDiv.pushback();
      this.nodeADiv.pushback();
      this.nodeBDiv.pushback();
      // switch (node) {
      // case DisplayNode.root: this.rootDiv.restore(); break;
      // case DisplayNode.mrca: this.mrcaDiv.restore(); break;
      // case DisplayNode.nodeA: this.nodeADiv.restore(); break;
      // case DisplayNode.nodeB: this.nodeBDiv.restore(); break;
      // }

    }
  }

}

const replaceUnknown = (val: string)=>val === '-' ? 'Unknown' : val;
