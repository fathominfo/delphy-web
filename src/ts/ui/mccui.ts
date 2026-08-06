import {SummaryTree} from '../pythia/delphy_api';
import {Pythia} from '../pythia/pythia';
import {DateLabel} from './datelabel';
import {TreeCanvas, instantiateMccTreeCanvas} from './treecanvas';
import {ColorOption, DataResolveType, getPercentLabel, getTimelineIndices, Screens} from './common';
import {UIScreen} from './uiscreen';
import {MccRef} from '../pythia/mccref';
import {SharedState} from '../sharedstate';
import { Metadata } from './metadata';
import { BlockSlider } from '../util/blockslider';
import { COLOR_CONF_SELECTOR, COLOR_META_SELECTOR, MccConfig } from './mccconfig';
import { NodeSchematic } from './nodeschematic';
import { HoverCallback } from './select/selectcommon';

const METADATA_BUTTON_TEMPLATE = document.querySelector(".mcc-opt-list.color .color--confidence")?.cloneNode(true) as HTMLLabelElement;
METADATA_BUTTON_TEMPLATE.classList.remove("color--confidence");
METADATA_BUTTON_TEMPLATE.classList.add("color--metadata");



export class MccUI extends UIScreen {
  mccRef: MccRef | null;
  mccTreeCanvas: TreeCanvas;
  schematic: NodeSchematic;
  highlightCanvas: HTMLCanvasElement;
  highlightCtx: CanvasRenderingContext2D;
  timelineIndices:DateLabel[];
  minDate: number;
  maxDate: number;
  baseTreeMinDate: number;
  credibilityInput: BlockSlider | null = null;

  constructor(sharedState: SharedState, divSelector: string, treeSelector:string) {
    super(sharedState, divSelector);
    this.mccTreeCanvas = instantiateMccTreeCanvas(treeSelector);
    const subway = this.div.querySelector(".schematic") as HTMLDivElement;
    const nodeHighlightCallback: HoverCallback = (nodeIndex, date, mutation)=>{}; // console.debug(nodeIndex, date, mutation);
    this.schematic = new NodeSchematic(subway, nodeHighlightCallback);
    this.highlightCanvas = document.createElement('canvas');
    this.highlightCanvas.classList.add("mcc_highlight");
    const maybeCtx = this.highlightCanvas.getContext('2d');
    if (!maybeCtx) {
      throw new Error('This browser does not support 2-dimensional canvas rendering contexts.');
    }
    this.highlightCtx = maybeCtx;
    this.timelineIndices = [];
    /* this will be updated whenever we get an MCC tree */
    this.minDate = 0;
    this.maxDate = 0;
    this.baseTreeMinDate = 0;
    this.mccRef = null;

    const canvas = this.mccTreeCanvas.getCanvas();
    canvas.parentNode?.appendChild(this.highlightCanvas);

    const zoomInBtn = this.div.querySelector(".mcc-zoom-button.zoom-in") as HTMLButtonElement;
    const zoomOutBtn = this.div.querySelector(".mcc-zoom-button.zoom-out") as HTMLButtonElement;
    const zoomResetBtn = this.div.querySelector(".mcc-zoom-button.reset") as HTMLButtonElement;

    if (zoomInBtn) { // if we have one, we have all
      const setEnabled = ()=>{
        // if (this.mccTreeCanvas.zoomAmount > 1) {
        zoomOutBtn.disabled = false;
        zoomResetBtn.disabled = false;
        // } else {
        //   zoomOutBtn.disabled = true;
        //   zoomResetBtn.disabled = true;
        // }
      };
      zoomInBtn?.addEventListener("click", ()=>{
        this.mccTreeCanvas.zoomIn();
        setEnabled();
      });
      zoomOutBtn?.addEventListener("click", ()=>{
        this.mccTreeCanvas.zoomOut();
        setEnabled();
      });
      zoomResetBtn?.addEventListener("click", ()=>{
        this.mccTreeCanvas.resetZoom();
        setEnabled();
      });
      setEnabled();
    }

    const goToCustomize = this.div.querySelector(".upload-metadata-msg a") as HTMLAnchorElement;
    if (goToCustomize) {
      goToCustomize.addEventListener("click", event=>{
        event.preventDefault();
        this.sharedState.goTo(Screens.customize);
      });
    }

  }


  activate() {
    /* hold onto the current mcc while this tab is open */
    if (this.pythia) this.mccRef = this.pythia.getMcc();
    const mccConfig = this.sharedState.mccConfig;
    mccConfig.bind(this.div);
    mccConfig.setListener(()=>this.handleConfigChange());
    if (this.mccTreeCanvas) {
      this.mccTreeCanvas.setConfig(mccConfig);
    }
    super.activate();
    this.updateData().then(()=>{
      if (mccConfig.metadataColorsDirty) {
        mccConfig.setMetadata(mccConfig.metadata as Metadata, (this.mccRef as MccRef).getMcc());
        mccConfig.setColorKeys(mccConfig.metadataField as string);
        mccConfig.setColorSystem(ColorOption.metadata);
      }
    });
    this.credibilityInput?.set(this.sharedState.mccConfig.confidenceThreshold * 100);
    this.setMetadataSelectors();
  }

  deactivate(): void {
    super.deactivate();
    if (this.mccRef) this.mccRef.release();
    this.mccRef = null;
  }


  resize(): void{
    this.mccTreeCanvas.sizeCanvas();
    this.schematic.resize();
    const canvas = this.mccTreeCanvas.getCanvas();
    this.highlightCanvas.width = canvas.width;
    this.highlightCanvas.height = canvas.height;
    this.highlightCanvas.style.width = canvas.style.width;
    this.highlightCanvas.style.height = canvas.style.height;
    this.highlightCanvas.style.top = `${canvas.offsetTop}px`;
    if (window.devicePixelRatio > 1) {
      this.highlightCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
    this.mccTreeCanvas.setAxisDates();
    this.requestTreeDraw();
    requestAnimationFrame(()=>this.mccTreeCanvas.renderAxisDates());
  }



  handleConfigChange(): void {
    if (this.pythia) {
      const pythia = this.pythia,
        mccRef = pythia.getMcc();
      this.div.querySelectorAll(".cred-threshold").forEach(ele=>{
        (ele as HTMLSpanElement).innerText = `${getPercentLabel(this.sharedState.mccConfig.confidenceThreshold)}%`;
      });
      this.setTreeFromConfig(mccRef, pythia).then(()=>{
        mccRef.release();
      });
    }
  }

  async setTreeFromConfig(mccRef: MccRef, _pythia: Pythia): Promise<SummaryTree> { // eslint-disable-line @typescript-eslint/no-unused-vars
    requestAnimationFrame(()=>document.body.classList.add("summarizing"));
    const prom = new Promise((resolve: DataResolveType)=>{
      setTimeout(()=>{
        const summary: SummaryTree = mccRef.getMcc();
        const nodeConfidence: number[] = mccRef.getNodeConfidence();
        const mccConfig = this.sharedState.mccConfig;
        if (mccConfig) {
          mccConfig.updateInnerNodeMetadata(summary);
          let input = this.div.querySelector(COLOR_META_SELECTOR) as HTMLInputElement;
          if (input) {
            input.checked = mccConfig.colorOption === ColorOption.metadata;
            input = this.div.querySelector(COLOR_CONF_SELECTOR) as HTMLInputElement;
            input.checked = mccConfig.colorOption === ColorOption.confidence;
          }
        }
        this.mccTreeCanvas.setTreeNodes(summary, nodeConfidence);
        requestAnimationFrame(()=>document.body.classList.remove("summarizing"));
        this.requestTreeDraw();
        resolve(summary);
      }, 10);
    });
    return prom;
  }


  protected updateData(): Promise<SummaryTree> {
    const prom = new Promise((resolve: DataResolveType)=>{
      if (this.pythia) {
        const oldRef = this.mccRef,
          pythia = this.pythia;
        this.mccRef = pythia.getMcc();
        /*
        did we load metadata at the start of the run before an mcc was available?
        */
        const config = this.sharedState.mccConfig,
          tree = this.mccRef.getMcc();
        if (config.metadata !== null && config.nodeMetadata === null) {
          config.setMetadata(config.metadata, tree);
          if (config.colorOption === ColorOption.metadata && config.metadataField !== null) {
            config.setMetadataField(config.metadataField, config.metadataColors[config.metadataField]);
          }
        }
        this.setTreeFromConfig(this.mccRef, this.pythia)
          .then((mccTree:SummaryTree)=>{
            const rootIndex = mccTree.getRootIndex();
            this.minDate = mccTree.getTimeOf(rootIndex);
            this.maxDate = pythia.maxDate;
            this.baseTreeMinDate = pythia.getBaseTreeMinDate();
            this.timelineIndices = getTimelineIndices(this.minDate, this.maxDate);
            if (oldRef) {
              oldRef.release();
            }
            resolve(mccTree);
          });
      }
    });
    return prom;
  }


  protected requestTreeDraw():void {
    requestAnimationFrame(()=>this.drawTree());
  }

  protected drawTree():void {
    // console.debug('drawing tree')
    if (this.pythia) {
      const drawRef = this.pythia.getMcc();
      this.mccTreeCanvas.draw();
      drawRef.release();
    }
  }

  setCladeCred() : void {
    if (!this.credibilityInput) return;
    const confValue = `${getPercentLabel(this.sharedState.mccConfig.confidenceThreshold)}`;
    this.div.querySelectorAll(".cred-threshold").forEach(ele=>{
      (ele as HTMLSpanElement).innerText = `${confValue}%`;
    });
    this.credibilityInput.set(this.sharedState.mccConfig.confidenceThreshold * 100);
    this.mccTreeCanvas.confidenceThreshold = this.sharedState.mccConfig.confidenceThreshold;
    this.mccTreeCanvas.colorsUnSet = true;
    if (this.mccTreeCanvas.tree) {
      this.mccTreeCanvas.setColors(this.mccTreeCanvas.tree);
      this.requestDraw();
    }
  }


  setMetadataSelectors() : void {
    const mccConfig: MccConfig = this.sharedState.mccConfig;
    const colorOpts = this.div.querySelector(".mcc-opt-list.color") as HTMLDivElement;
    if (!colorOpts) return;
    if (!mccConfig.metadata) {
      colorOpts.classList.add("no-metadata");
    } else {
      colorOpts.classList.remove("no-metadata");
      const metadataList = colorOpts.querySelector(".metadata-list") as HTMLDivElement;
      const metadataFields: string[] = mccConfig.metadata.getFields();
      const current = mccConfig.metadataField;
      metadataList.querySelectorAll("label").forEach(ele=>ele.remove());
      metadataFields.forEach(field=>{
        /* skip metadata by the id field */
        if (field.toLowerCase() === "id" || field.toLowerCase() === "accession") return;
        const button = METADATA_BUTTON_TEMPLATE.cloneNode(true) as HTMLLabelElement;
        const span = button.querySelector("span") as HTMLInputElement;
        const input = button.querySelector("input") as HTMLInputElement;
        span.textContent = field;
        input.value = field;
        if (field === current) input.checked = true;
        metadataList.appendChild(button);
      });



    }
  }



  requestDraw() { console.debug('the inheriting class should implement this');}


}
