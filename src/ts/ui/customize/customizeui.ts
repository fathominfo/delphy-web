import { ColorOption, COLOR_CONF, COLOR_METADATA,
  CONFIDENCE_DEFAULT, ColorDict, getTimestampString, MetadataColorOption } from '../common';
import {noop} from '../../constants';
import {MccUI} from '../mccui';
import {SharedState} from '../../sharedstate';
import { Metadata, ColumnSummary } from '../metadata';
import { ColorChooser } from '../colorchooser';
import { MccTree, SummaryTree } from '../../pythia/delphy_api';
import { MccTreeCanvas } from '../mcctreecanvas';
import { PdfCanvas } from '../../util/pdfcanvas';
import * as JSZip from 'jszip';
import { MccConfig } from '../mccconfig';

/* global NodeListOf */

const COLUMN_HEADING_TEMP = document.querySelector(".column-heading") as HTMLElement;
COLUMN_HEADING_TEMP.remove();

const LEGEND_KEY_TEMP = document.querySelector(".legend-key") as HTMLElement;
LEGEND_KEY_TEMP.remove();

const MAX_VALS_TO_SHOW = 10;

const BEAST_VERSION_SELECTOR = document.querySelector("#beast-version") as HTMLDialogElement;
BEAST_VERSION_SELECTOR.close();

BEAST_VERSION_SELECTOR.addEventListener("click", (event) => {
  if (event.target === event.currentTarget) {
    BEAST_VERSION_SELECTOR.close();
  }
});


/* the linter doesn't recognize that NodeListOf is a built in */
/* global NodeListOf */

type selectAllCallbackType = ()=>void;
type colorComponent = {
  checkBox: HTMLInputElement,
  colorInput: HTMLInputElement,
  nodeColor: MetadataColorOption}

export class CustomizeUI extends MccUI {
  selectedNodes: {
    [node: number]: boolean
  } = {};

  annotations: {
    dates: boolean,
    confidence: boolean
  } = {
      dates: false,
      confidence: false
    };

  colorSystem: ColorOption = ColorOption.confidence;
  minConfidence: number = CONFIDENCE_DEFAULT;

  // topology: Topology = Topology.mcc;

  // presentation: Presentation = Presentation.all;

  // spacing: YSpacing = YSpacing.even;

  colorChooser: ColorChooser = new ColorChooser();

  selectAllToggle: HTMLInputElement;
  selectAllCallback: selectAllCallbackType | null;

  metadataLoaded = false;

  constructor(sharedState: SharedState, divSelector: string) {
    super(sharedState, divSelector, "#customize--mcc-canvas");

    this.selectAllToggle = this.div.querySelector("#select-all-toggle") as HTMLInputElement;
    this.selectAllCallback = null;

    // node selections
    (this.div.querySelectorAll(".customize--node") as NodeListOf<HTMLInputElement>).forEach(el => {
      el.addEventListener("change", () => this.setNodeSelection(parseInt(el.value), el.checked))
    });

    // annotations
    for (const key in this.annotations) {
      this.setAnnotation(key, false);
    }
    (this.div.querySelectorAll(".annotate") as NodeListOf<HTMLInputElement>).forEach(el => {
      el.addEventListener("change", () => this.setAnnotation(el.value, el.checked));
    });

    // color system
    (this.div.querySelectorAll("#customize--color .paragraph-radio input") as NodeListOf<HTMLInputElement>).forEach(el => {
      const system = el.value === COLOR_CONF ? ColorOption.confidence : ColorOption.metadata;
      el.addEventListener("input", () => this.setColorSystem(system));
    });

    // min confidence
    (this.div.querySelectorAll(".min-confidence") as NodeListOf<HTMLInputElement>).forEach(el => {
      el.addEventListener("input", () => {
        const val = parseFloat(el.value);
        if (Number.isNaN(val)) return;
        this.setMinConfidence(val);
      });
    });

    (this.div.querySelector("#export-png") as HTMLButtonElement).addEventListener('click', ()=>{
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D,
        imgTreeCanvas = new MccTreeCanvas(canvas, ctx),
        mccConfig = this.sharedState.mccConfig,
        tree = this.mccTreeCanvas.tree as SummaryTree,
        conf = this.mccTreeCanvas.creds;
      canvas.width = 500;
      canvas.height = 750;
      imgTreeCanvas.width = 500;
      imgTreeCanvas.height = 750;
      if (mccConfig) {
        imgTreeCanvas.setConfig(mccConfig);
        mccConfig.updateInnerNodeMetadata(tree);
      }
      imgTreeCanvas.setTreeNodes(tree, conf);
      // const mcccc = this.mccTreeCanvas.canvas;
      // (mcccc.parentNode as HTMLElement).insertBefore(canvas, mcccc);
      imgTreeCanvas.draw(this.minDate, this.maxDate, this.timelineIndices);
      const a = document.createElement("a"),
        url = canvas.toDataURL('image/png', 1.0),
        title = `delphy-${getTimestampString()}.png`;
      // console.log('URL', url);
      a.href = url;
      a.download = title;
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>a.remove(), 10000);


    });

    (this.div.querySelector("#export-pdf") as HTMLButtonElement).addEventListener('click', ()=>{
      const canvas = new PdfCanvas(500, 750),
        ctx = canvas.getContext(),
        imgTreeCanvas = new MccTreeCanvas(canvas, ctx),
        mccConfig = this.sharedState.mccConfig,
        tree = this.mccTreeCanvas.tree as SummaryTree,
        conf = this.mccTreeCanvas.creds;
      const promises: Promise<void>[] = [];
      /*
      jspdf does not support .otf files, so we have these home made .ttf conversions
      */
      promises.push(canvas.addFont('/assets/fonts/roboto/roboto-bold.ttf', 'Roboto', '700'));
      promises.push(canvas.addFont('/assets/fonts/roboto/roboto-medium.ttf', 'Roboto', '500'));
      Promise.all(promises).then(()=>{
        // console.debug(canvas.getFontList());
        canvas.width = 500;
        canvas.height = 750;
        imgTreeCanvas.width = 500;
        imgTreeCanvas.height = 750;
        if (mccConfig) {
          imgTreeCanvas.setConfig(mccConfig);
          mccConfig.updateInnerNodeMetadata(tree);
        }
        imgTreeCanvas.setTreeNodes(tree, conf);
        // const mcccc = this.mccTreeCanvas.canvas;
        // (mcccc.parentNode as HTMLElement).insertBefore(canvas, mcccc);
        imgTreeCanvas.draw(this.minDate, this.maxDate, this.timelineIndices, canvas);
        canvas.save(`delphy-${getTimestampString()}.pdf`);
      });
    });

    (this.div.querySelector("#export-nwk") as HTMLButtonElement).addEventListener('click', ()=>{
      const summaryTree = this.mccTreeCanvas.tree as SummaryTree;
      if (!(summaryTree instanceof MccTree)) {
        console.debug('export newick only implemented for MCC trees so far')
        return;
      }
      const mccTree = summaryTree as MccTree;
      const innerNodesDefinedAsMrcasOfTips = false;  // TODO: Should reflect UX flag???
      const outBuffer = mccTree.exportToNewick(innerNodesDefinedAsMrcasOfTips);
      const file = new Blob([outBuffer], {type: "application/text;charset=utf-8"}),
        a = document.createElement("a"),
        url = URL.createObjectURL(file),
        title = `delphy-${getTimestampString()}.nwk`;
      a.href = url;
      a.download = title;
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>a.remove(), 10000);
    //   const conf = this.mccTreeCanvas.creds;
    //   console.log("monphyletic percent by node:",conf);
    });


    const getBeastVersion = (actionLabel: string)=>{
      (BEAST_VERSION_SELECTOR.querySelector("#beast-version-action") as HTMLSpanElement).textContent = actionLabel;
      BEAST_VERSION_SELECTOR.showModal();
      const form = BEAST_VERSION_SELECTOR.querySelector("form") as HTMLFormElement;
      const dismissButton = form.querySelector("button.close-button") as HTMLButtonElement;
      const cancelButton = form.querySelector("button.cancel-button") as HTMLButtonElement;
      return new Promise((resolve:(version:string)=>void, reject:()=>void)=>{
        const submitHandler = ()=>{
          form.removeEventListener("submit", submitHandler);
          dismissButton.removeEventListener("click", dismissHandler);
          cancelButton.removeEventListener("click", dismissHandler);
          resolve(form.version.value);
        };
        const dismissHandler = ()=>{
          form.removeEventListener("submit", submitHandler);
          dismissButton.removeEventListener("click", dismissHandler);
          cancelButton.removeEventListener("click", dismissHandler);
          BEAST_VERSION_SELECTOR.close();
          reject();
        };
        form.addEventListener("submit", submitHandler);
        dismissButton.addEventListener("click", dismissHandler);
        cancelButton.addEventListener("click", dismissHandler);

      });
    };


    const beastInput = this.div.querySelector("#export-beast-input") as HTMLButtonElement;
    beastInput.addEventListener('click', ()=>{
      getBeastVersion("Input")
        .then((version:string)=>{
          if (this.pythia) {
            const outBuffer = this.pythia.exportBeastInput(version);
            const file = new Blob([outBuffer], {type: "application/text;charset=utf-8"}),
              a = document.createElement("a"),
              url = URL.createObjectURL(file),
              title = `beast-input-${getTimestampString()}.xml`;
            a.href = url;
            a.download = title;
            document.body.appendChild(a);
            a.click();
            setTimeout(()=>a.remove(), 10000);
          }
        })
        .catch(noop);
    });

    const beastOutput = this.div.querySelector("#export-beast-output") as HTMLButtonElement;
    beastOutput.addEventListener('click', ()=>{
      getBeastVersion("Output")
        .then(version=>{
          if (this.pythia) {
            const {log, trees} = this.pythia.getBeastOutputs(version),
              timestamp = getTimestampString();

            const fileLog = new Blob([log], {type: "application/text;charset=utf-8"}),
              titleLog = `beast.log`;

            const fileTrees = new Blob([trees], {type: "application/text;charset=utf-8"}),
              titleTrees = `beast.trees`;

            let zip: JSZip;
            try {
            // @ts-expect-error: JSZip doesn't import the same way after transpilation
              zip = new JSZip.default(); // eslint-disable-line new-cap
            } catch (err) {
              zip = new JSZip();
            }
            zip.file(titleLog, fileLog);
            zip.file(titleTrees, fileTrees);

            zip.generateAsync({type:"blob"}) // 1) generate the zip file
              .then((blob)=>{
                const a = document.createElement("a"),
                  url = URL.createObjectURL(blob),
                  title = `delphy-${timestamp}_beast.zip`;
                a.href = url;
                a.download = title;
                document.body.appendChild(a);
                a.click();
                setTimeout(()=>a.remove(), 10000);
              });
          }
        })
        .catch(noop);
    });


    (this.div.querySelector("#export-dphy") as HTMLButtonElement).addEventListener('click', ()=>{
      if (this.pythia) {
        /*
        if the knee has been only set via the auto estimator
        we don't want to export it. In that case:
          1) get the current knee index
          2) set pythia knee index to 0
          3) export pythia etc
          4) restore the knee index
        */
        const exportKnee = this.sharedState.kneeIsCurated;
        const pythiaKnee = this.pythia.kneeIndex;
        if (!exportKnee) {
          this.pythia.setKneeIndexByPct(0);
        }
        const config = this.sharedState.exportConfig(),
          outBuffer = this.pythia.getSaveBuffer(config),
          file = new Blob([outBuffer], {type: "application/octet-binary;charset=utf-8"}),
          a = document.createElement("a"),
          url = URL.createObjectURL(file),
          title = `delphy-${getTimestampString()}.dphy`;
        a.href = url;
        a.download = title;
        document.body.appendChild(a);
        a.click();
        setTimeout(()=>a.remove(), 10000);
        if (!exportKnee) {
          this.pythia.setKneeIndexByPct(pythiaKnee / this.pythia.getBaseTreeCount());
        }
      }
    });


    // metadata
    const upload = this.div.querySelector("#metadata-file-input") as HTMLInputElement;
    upload.value = "";
    upload.addEventListener("change", () => {
      const files = upload.files;
      if (files) {
        this.showMetadataLoading();
        this.parseMetadataFile(files[0]);
      }
    });
    const uploadArea = this.div.querySelector("#metadata-file-label") as HTMLElement;
    uploadArea.addEventListener("drop", e => {
      e.preventDefault();
      e.stopPropagation();
      this.showMetadataLoading();
      if (e.dataTransfer) {
        const files = e.dataTransfer.files;
        if (files) {
          this.parseMetadataFile(files[0]);
        }
      }
    });

    // // topology
    // (this.div.querySelectorAll("#customize--tree-topology .paragraph-radio input") as NodeListOf<HTMLInputElement>).forEach(el => {
    //   const topology = el.value === TOPOLOGY_MCC ? Topology.mcc : Topology.bestof;
    //   el.addEventListener("input", () => this.setTopology(topology));
    // });

    // // presentation
    // (this.div.querySelectorAll("#customize--tree-presentation .paragraph-radio input") as NodeListOf<HTMLInputElement>).forEach(el => {
    //   const presentation = el.value === PRESENTATION_ALL ? Presentation.all : Presentation.umbrella;
    //   el.addEventListener("input", () => this.setPresentation(presentation));
    // });

    // // spacing
    // (this.div.querySelectorAll("#customize--tree-spacing .paragraph-radio input") as NodeListOf<HTMLInputElement>).forEach(el => {
    //   const spacing = el.value === Y_EVEN_SPACING ? YSpacing.even : YSpacing.genetic;
    //   el.addEventListener("input", () => this.setSpacing(spacing));
    // });
  }


  activate() {
    super.activate();
    // this.setTopology(this.sharedState.mccConfig.topology);
    this.setColorSystem(this.sharedState.mccConfig.colorOption);
    this.setMinConfidence(this.sharedState.mccConfig.confidenceThreshold * 100);
    // this.setSpacing(this.sharedState.mccConfig.ySpacing);
    // this.setPresentation(this.sharedState.mccConfig.presentation);
    if (this.sharedState.mccConfig.nodeMetadata) {
      this.endMetadataLoading();
      const conf = this.sharedState.mccConfig;
      if (conf.metadataField !== null) {
        this.div.querySelectorAll("#customize--color--metadata #color-by option").forEach((ele)=>{
          const opt = ele as HTMLOptionElement;
          opt.selected = opt.value === conf.metadataField;
        });
      }
    }
    this.setMetadataDisplay();
  }


  setNodeSelection(node: number, selected: boolean) {
    this.selectedNodes[node] = selected;
    (this.div.querySelector(`#customize--node-${node}`) as HTMLInputElement).checked = selected;
  }

  setAnnotation(type: string, selected: boolean) {
    if (!(type === "dates" || type === "confidence")) {
      console.debug(`"${type}" annotation type not recognized`);
      return;
    }

    this.annotations[type] = selected;
    (this.div.querySelector(`#annotate-${type}`) as HTMLInputElement).checked = selected;
  }

  setColorSystem(system: ColorOption) {
    this.colorSystem = system;
    const selectedValue = system === ColorOption.confidence ? COLOR_CONF : COLOR_METADATA;
    (this.div.querySelectorAll("#customize--color .paragraph-radio input") as NodeListOf<HTMLInputElement>).forEach(el => {
      const checked = el.value === selectedValue;
      el.checked = checked;
      el.parentElement?.parentElement?.querySelector(".color-system--details")?.classList.toggle("hidden", !checked);
    });
    this.sharedState.mccConfig.setColorSystem(system);
  }

  setMinConfidence(value: number) {
    this.minConfidence = value;
    (this.div.querySelector("#min-confidence-number") as HTMLInputElement).value = `${value}`;
    (this.div.querySelector("#min-confidence-slider") as HTMLInputElement).value = `${value}`;
    this.sharedState.mccConfig.setConfidence(value/100.0);
  }

  showMetadataLoading() : void {
    (this.div.querySelector("#metadata-file") as HTMLElement).classList.add("loading");
  }

  endMetadataLoading() : void {
    (this.div.querySelector("#metadata-file") as HTMLElement).classList.remove("loading");
    if (this.sharedState.mccConfig.hasMetadata()) {
      (this.div.querySelector("#metadata-file") as HTMLElement).classList.remove("no-metadata");
      (this.div.querySelector(".uploader-text") as HTMLElement).innerText = `${this.sharedState.mccConfig.getMetadataFilename()}`;
      const input = (this.div.querySelector("#color-system--metadata") as HTMLInputElement);
      input.disabled = false;
      input.click();
      this.setMetadataDisplay();
    }
  }


  setMetadataDisplay(): void {
    if (!this.metadataLoaded) {
      const columnsContainer = this.div.querySelector("#metadata-column-headings") as HTMLElement;
      if (!this.sharedState.mccConfig.hasMetadata()) {
        columnsContainer.classList.add("hidden");
      } else {
        this.metadataLoaded = true;
        const config = this.sharedState.mccConfig;
        if (config.metadataField === null) {
          config.metadataField = config.metadata?.header.filter(col=>col!=='id')[0] || null;
        }
        columnsContainer.classList.remove("hidden");
        const addField = (name: string, col: ColumnSummary)=>{
          const el = COLUMN_HEADING_TEMP.cloneNode(true) as HTMLElement;
          columnsContainer.appendChild(el);
          const details = el.querySelector("details") as HTMLDetailsElement;
          if (col.unique <= MAX_VALS_TO_SHOW) {
            details.open = true;
          }
          const summary = el.querySelector("summary") as HTMLElement;
          (summary.querySelector(".name") as HTMLElement).innerText = name;
          (summary.querySelector(".count") as HTMLElement).innerText = `${col.unique} unique values`;
          const valDivTemp = el.querySelector(".value") as HTMLElement;
          valDivTemp.remove();
          col.sorted.forEach(([val, count])=>{
            const div = valDivTemp.cloneNode(true) as HTMLElement;
            (details.querySelector(".values") as HTMLElement).appendChild(div);
            (div.querySelector(".name") as HTMLElement).innerText = val;
            (div.querySelector(".count") as HTMLElement).innerText = `${count}`;
          });
        }

        const select = this.div.querySelector("#customize--color--metadata #color-by") as HTMLSelectElement;

        const handleSelect = () => {
          this.updataMetadataKeys(select.value);
        }
        select.addEventListener("change", handleSelect);

        const header = config.getMetadataFields();

        header?.forEach(colName=>{
          const summary = this.sharedState.mccConfig.getColumnSummary(colName);
          if (summary) {
            addField(colName, summary);
            const option = document.createElement("option");
            select.appendChild(option);
            option.innerText = colName;
            // option.value = colName.toLowerCase();
            option.value = colName;
            option.selected = colName === config.metadataField;
          }
        });

        handleSelect();
      }
    }
  }


  updataMetadataKeys(field: string): void {
    const mccConfig = this.sharedState.mccConfig;
    if (!mccConfig.hasMetadata()) {
      throw new Error("can't set a medata field when we have no metadata on the MccConfig.")
    }
    const container = this.div.querySelector("#metadata-legend") as HTMLElement,
      fieldContainer = this.div.querySelector("#customize--color--metadata .color-system--details") as HTMLDivElement;
    const colorAll = mccConfig.setColorKeys(field);
    const colors: ColorDict = mccConfig.metadataColors[field];
    container.innerHTML = "";
    fieldContainer.classList.toggle('many', !colorAll);
    const allComponents: colorComponent[] = [];
    if (this.selectAllCallback) {
      this.selectAllToggle.removeEventListener('change', this.selectAllCallback);
    }
    if (colorAll) {
      this.selectAllCallback = null;
    } else {
      const selectAllCallback = ()=>{
        if (this.selectAllToggle.checked) {
          allComponents.forEach(({checkBox, colorInput, nodeColor})=>{
            checkBox.checked = true;
            colorInput.value = nodeColor.color;
            nodeColor.active = true;
          });
        } else {
          allComponents.forEach(({checkBox, colorInput, nodeColor})=>{
            checkBox.checked = false;
            colorInput.value = nodeColor.color;
            nodeColor.active = false;
          });
        }
        mccConfig.setMetadataField(field, colors);
      };
      this.selectAllToggle.addEventListener("change", selectAllCallback);
      this.selectAllCallback = selectAllCallback;
    }
    Object.entries(colors).forEach(([key, nodeColor]) => {
      const el = LEGEND_KEY_TEMP.cloneNode(true) as HTMLElement,
        checkBox = el.querySelector('.color-active') as HTMLInputElement,
        label = el.querySelector('.name') as HTMLLabelElement,
        colorInput = el.querySelector('.color') as HTMLInputElement;
      container.appendChild(el);
      const id = `id_${key.toLowerCase().replace(" ", "")}`;
      checkBox.id = id;
      label.htmlFor = id;
      label.innerText = key;
      colorInput.value = nodeColor.color;
      checkBox.checked = colors[key].active;
      checkBox.addEventListener('change', ()=>{
        if (checkBox.checked) {
          colors[key].active = true;
          colorInput.value = colors[key].color;
        } else if (colors[key]) {
          colors[key].active = false;
        }
        mccConfig.setMetadataField(field, colors);
      });
      colorInput.addEventListener('input', () => {
        colorInput.select();
        const value = colorInput.value;
        // console.log(value);
        // colorList[index] = value;
        // colors[key] = {color: colorList[index], active: true};
        mccConfig.setMetadataKeyColor(field, key, value);
      });

      allComponents.push({checkBox, colorInput, nodeColor})
    });
  }



  parseMetadataFile(file: File) {
    parseMetadataFile(file, this.sharedState.mccConfig, this.mccTreeCanvas, ()=>this.endMetadataLoading());
  }



  // setTopology(topology: Topology) {
  //   this.topology = topology;
  //   const selectedValue = topology === Topology.mcc ? TOPOLOGY_MCC : TOPOLOGY_BEST_OF;
  //   (this.div.querySelectorAll("#customize--tree-topology .paragraph-radio input") as NodeListOf<HTMLInputElement>).forEach(el => {
  //     const checked = el.value === selectedValue;
  //     el.checked = checked;
  //   });
  //   this.sharedState.mccConfig.setTopology(topology)
  // }

  // setPresentation(presentation: Presentation) {
  //   this.presentation = presentation;
  //   const selectedValue = presentation === Presentation.all ? PRESENTATION_ALL : PRESENTATION_UMBRELLA;
  //   (this.div.querySelectorAll("#customize--tree-presentation .paragraph-radio input") as NodeListOf<HTMLInputElement>).forEach(el => {
  //     const checked = el.value === selectedValue;
  //     el.checked = checked;
  //   });
  //   this.sharedState.mccConfig.setPresentation(presentation);
  // }

  // setSpacing(spacing: YSpacing) {
  //   this.spacing = spacing;
  //   const selectedValue = spacing === YSpacing.even ? Y_EVEN_SPACING : Y_GENETIC_DISTANCE;
  //   (this.div.querySelectorAll("#customize--tree-spacing .paragraph-radio input") as NodeListOf<HTMLInputElement>).forEach(el => {
  //     const checked = el.value === selectedValue;
  //     el.checked = checked;
  //   });
  //   this.sharedState.mccConfig.setSpacing(spacing);
  // }
}


/*
adding metadata does not have to be part of the customize page.
If we _do_ decide to move it out of here, this is what it will require.
[mark 241125]
*/
const parseMetadataFile = (file: File, mccConfig: MccConfig, mccTreeCanvas: MccTreeCanvas, callback: ()=>void)=>{
  let separator = "";
  if (file.type === "text/tab-separated-values" || file.name.endsWith(".tsv")) {
    separator = "\t";
  } else if (file.type === "text/csv" || file.name.endsWith(".csv")) {
    separator = ",";
  }
  const reader = new FileReader();
  try {
    reader.addEventListener("load", ()=>{
      const text = reader.result as string;
      if ("" === separator) {
        /* take a peek at the first line and guess */
        const nl = text.indexOf('\n');
        const first = text.substring(0, nl);
        const commaCount = first.split(',').length - 1;
        const tabCount = first.split('\t').length - 1;
        separator = commaCount > tabCount ? ',' : '\t';
      }
      const metadata = new Metadata(file.name, text, separator);
      mccConfig.setMetadata(metadata, mccTreeCanvas.tree as SummaryTree);
      callback();
    });
    reader.readAsText(file);
  } catch (err) {
    console.log(err);
    alert("error loading metadata file. Please check that it is formatted correctly. If that's not the issue, please let us know at delphy@fathom.info");
  }
}
