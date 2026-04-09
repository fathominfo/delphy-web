import {SummaryTree} from '../pythia/delphy_api';
import {Pythia} from '../pythia/pythia';
import {DateLabel} from './datelabel';
import {MccTreeCanvas, instantiateMccTreeCanvas} from './mcctreecanvas';
import {ColorOption, DataResolveType, getPercentLabel, getTimelineIndices} from './common';
import {UIScreen} from './uiscreen';
import {MccRef} from '../pythia/mccref';
import {SharedState} from '../sharedstate';
import { Metadata } from './metadata';
import { BlockSlider } from '../util/blockslider';


export class MccUI extends UIScreen {
  mccRef: MccRef | null;
  mccTreeCanvas: MccTreeCanvas;
  highlightCanvas: HTMLCanvasElement;
  highlightCtx: CanvasRenderingContext2D;
  timelineIndices:DateLabel[];
  minDate: number;
  maxDate: number;
  baseTreeMinDate: number;
  credibilityInput: BlockSlider | null = null;

  constructor(sharedState: SharedState, divSelector: string, treeSelector:string) {
    super(sharedState, divSelector);
    this.mccTreeCanvas = instantiateMccTreeCanvas(treeSelector)
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
  }

  deactivate(): void {
    super.deactivate();
    if (this.mccRef) this.mccRef.release();
    this.mccRef = null;
  }


  resize(): void{
    this.mccTreeCanvas.sizeCanvas();
    const canvas = this.mccTreeCanvas.getCanvas();
    this.highlightCanvas.width = canvas.width;
    this.highlightCanvas.height = canvas.height;
    this.highlightCanvas.style.width = canvas.style.width;
    this.highlightCanvas.style.height = canvas.style.height;
    this.highlightCanvas.style.top = `${canvas.offsetTop}px`;
    if (window.devicePixelRatio > 1) {
      this.highlightCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
    this.requestTreeDraw();
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

  requestDraw() { console.debug('the inheriting class should implement this');}


}
