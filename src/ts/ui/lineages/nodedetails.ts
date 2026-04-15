import { getPercentLabel } from '../common';
import { DisplayNode } from './displaynode';
import { HoverCallback, NodeCallback } from './lineagescommon';

const DEBUG = false;

export class NodeDetails {
  div: HTMLDivElement;
  tipIdSpan: HTMLElement;
  nodeName: HTMLSpanElement;
  countSpan: HTMLSpanElement;
  confidenceSpan: HTMLSpanElement;
  monophyletic: HTMLSpanElement;
  innerNodeMetadata: HTMLDivElement;
  tipMetadata: HTMLDivElement;

  innerMetadataTemplate: HTMLElement;
  tipMetadataTemplate: HTMLElement;

  node: DisplayNode | null = null;
  dismissCallback: NodeCallback;
  nodeHighlightCallback: HoverCallback;
  rootSelectCallback: NodeCallback;

  constructor(dismissCallback: NodeCallback, nodeHighlightCallback: HoverCallback, rootSelectCallback: NodeCallback) {
    this.div = document.querySelector(".lineages--node-info") as HTMLDivElement;

    const tipDiv = this.div.querySelector(".node-info--tip") as HTMLDivElement;
    const innerNodeDiv = this.div.querySelector(".node-info--inner-node") as HTMLDivElement;

    this.countSpan = innerNodeDiv.querySelector('.node--tip-count') as HTMLSpanElement;
    this.confidenceSpan = innerNodeDiv.querySelector('.node--confidence') as HTMLSpanElement;

    this.tipIdSpan = tipDiv.querySelector(".tip-id") as HTMLElement;
    this.monophyletic = this.div.querySelector(".mono-hover") as HTMLSpanElement;
    this.nodeName = this.div.querySelector(".node-name") as HTMLSpanElement;

    this.innerNodeMetadata = innerNodeDiv.querySelector(".metadata") as HTMLDivElement;
    this.tipMetadata = tipDiv.querySelector(".metadata") as  HTMLDivElement;
    this.innerMetadataTemplate = innerNodeDiv.querySelector(".node-metadata-item") as HTMLElement;
    this.tipMetadataTemplate = tipDiv.querySelector("tr") as HTMLElement;
    this.innerMetadataTemplate.remove();
    this.tipMetadataTemplate.remove();


    this.dismissCallback = dismissCallback;
    this.nodeHighlightCallback = nodeHighlightCallback;
    this.rootSelectCallback = rootSelectCallback;
  }


  setData(node: DisplayNode) : void {
    this.node = node;
  }

  requestDraw() {
    requestAnimationFrame(()=>this.draw());

  }


  draw() {
    const { node, div } = this;

    if (node === null) {
      this.div.classList.remove('active');
      this.div.classList.remove('locked');
      return;
    }


    div.classList.add('active');
    div.setAttribute("data-nodetype", node.className.toLowerCase());
    this.nodeName.textContent = node.label;

    div.classList.toggle('locked', node.isLocked);
    div.classList.toggle("is-tip", node.isTip());
    div.classList.toggle("is-mrca", node.isInferred && !node.isRoot);
    div.classList.toggle("is-root", node.isRoot && node.isInferred);
    div.classList.toggle("is-set-root", node.isRoot && !node.isInferred);


    if (node.isTip()) {
      const { tipIdSpan, tipMetadata, tipMetadataTemplate } = this;
      const container = tipMetadata.querySelector("table") as HTMLTableElement;
      if (DEBUG) {
        tipIdSpan.innerText = `${node.index} `;
      }
      if (node.metadata === null) {
        tipMetadata.classList.add("hidden");
      } else {
        tipMetadata.classList.remove("hidden");
        if (node.metadata.id !== undefined) {
          tipIdSpan.innerText = `${node.metadata.id.value}`;
          tipIdSpan.title = node.metadata.id.value;
        } else if (node.metadata.accession !== undefined) {
          tipIdSpan.innerText = `${node.metadata.accession.value}`;
          tipIdSpan.title = node.metadata.accession.value;
        }
        tipMetadata.querySelectorAll("tr").forEach(div=>div.remove());
        Object.entries(node.metadata).forEach(([key, value])=>{
          if (key.toLowerCase() !== 'id' && key.toLowerCase() !== 'accession'){
            const item = tipMetadataTemplate.cloneNode(true) as HTMLTableRowElement;
            (item.querySelector("th") as HTMLTableCellElement).innerText = key;
            (item.querySelector("td") as HTMLTableCellElement).innerText = replaceUnknown(value.value);
            container.appendChild(item);
          }
        });
      }
    } else {
      const { countSpan, confidenceSpan, innerNodeMetadata, innerMetadataTemplate} = this;
      countSpan.innerText = `${node.childCount} tip${node.isTip() ? '' : 's'}`;
      confidenceSpan.innerText = `${getPercentLabel(node.confidence)}%`;
      // if (node.metadata === null || (Object.keys(node.metadata).length === 1 && node.metadata.id !== undefined)) {
      if (node.metadata === null || Object.keys(node.metadata).length === 0) {
        innerNodeMetadata.classList.add('hidden');
      } else {
        innerNodeMetadata.classList.remove('hidden');
        innerNodeMetadata.querySelectorAll(".node-metadata-item").forEach(div=>div.remove());
        Object.entries(node.metadata).forEach(([key, value])=>{
          if (key.toLowerCase() !== 'id' && key.toLowerCase() !== 'accession'){
            const item = innerMetadataTemplate.cloneNode(true) as HTMLElement;


            const summary = item.querySelector(".pair--key-value") as HTMLElement;
            (summary.querySelector(".key") as HTMLElement).innerText = key;
            (summary.querySelector(".value") as HTMLElement).innerText = replaceUnknown(value.value);

            const valueCountPair = item.querySelector(".pair--value-count") as HTMLElement;
            item.querySelectorAll(".pair--value-count").forEach(el => el.remove());

            innerNodeMetadata.appendChild(item);


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

          }
        });
      }

    }


  }

  clear() {
    this.node = null;
    this.div.remove();
  }

  pushback() {
    this.div.classList.add('lowlight');
  }

  restore() {
    this.div.classList.remove('lowlight');
  }

}



const replaceUnknown = (val: string)=>val === '-' ? 'Unknown' : val;


