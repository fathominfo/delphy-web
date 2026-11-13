import { SummaryTree } from "./pythia/delphy_api";
import { MccRef } from "./pythia/mccref";
import { Pythia } from "./pythia/pythia";
import { SharedState } from "./sharedstate";
import { ColorOption, getTimelineIndices, getTimestampString } from "./ui/common";
import { MccConfig } from "./ui/mccconfig";
import { MccTreeCanvas } from "./ui/mcctreecanvas";
import { PdfCanvas } from "./util/pdfcanvas";


type ExportOptions = {
  colorOption: string,
  includeZoom: boolean,
  includeNodes: boolean,
  branchWidthByTips: boolean
}
export function setupDownload(sharedState: SharedState) {
  const downloadBtn = document.querySelector(".nav-download-button") as HTMLButtonElement;
  const downloadMenu = document.querySelector(".mcc-download-menu") as HTMLDivElement;
  downloadBtn.addEventListener("click", () => { downloadMenu.classList.toggle("expanded") });

  // TODO: clicking elsewhere should also dismiss this dialog
  const form = document.querySelector("#mcc-download-form") as HTMLFormElement;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const format = formData.get("export-format");
    const options: ExportOptions = {
      colorOption: formData.get("branch-color") as string,
      includeZoom: formData.has("zoom-area"),
      includeNodes: formData.has("selected-nodes"),
      branchWidthByTips: formData.has("branch-width")
    };
    const pythia = sharedState.pythia;
    const mccRef = pythia.getMcc();
    const mcc = mccRef.getMcc() as SummaryTree;

    const exportMccConfig = sharedState.mccConfig;
    exportMccConfig.colorOption = options.colorOption === "metadata" ? ColorOption.metadata : options.colorOption === "credibility" ? ColorOption.confidence : ColorOption.none;
    if (format === "pdf") exportPDF(pythia, exportMccConfig, mcc, mccRef, options);
    else exportPNG(pythia, exportMccConfig, mcc, mccRef, options);
  });
}

function exportPNG(pythia: Pythia, mccConfig: MccConfig, mcc: SummaryTree, mccRef: MccRef, options: ExportOptions) {
  const scale = 3;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const imgTreeCanvas = new MccTreeCanvas(canvas, ctx);
  canvas.width = 500 * scale;
  canvas.height = 750 * scale;
  imgTreeCanvas.width = 500;
  imgTreeCanvas.height = 750;
  ctx.scale(scale, scale);
  prepareAndDrawTree(mccRef,mccConfig,imgTreeCanvas,mcc,pythia,options);
  const a = document.createElement("a");
  const url = canvas.toDataURL("image/png");
  const title = `delphy-${getTimestampString()}.png`;
  a.href = url;
  a.download = title;
  document.body.appendChild(a);
  a.click();

  mccRef.release();
  setTimeout(() => a.remove(), 10000);
}

function exportPDF(pythia: Pythia, mccConfig: MccConfig, mcc: SummaryTree, mccRef: MccRef, options: ExportOptions) {

  const canvas = new PdfCanvas(500, 750),
    ctx = canvas.getContext(),
    imgTreeCanvas = new MccTreeCanvas(canvas, ctx)
  const promises: Promise<void>[] = [];
  /*
    jspdf does not support .otf files, so we have these home made .ttf conversions
    */
  promises.push(canvas.addFont('/assets/fonts/roboto/roboto-bold.ttf', 'Roboto', '700'));
  promises.push(canvas.addFont('/assets/fonts/roboto/roboto-medium.ttf', 'Roboto', '500'));
  Promise.all(promises).then(() => {
    // console.debug(canvas.getFontList());
    canvas.width = 500;
    canvas.height = 750;
    imgTreeCanvas.width = 500;
    imgTreeCanvas.height = 750;
    prepareAndDrawTree(mccRef, mccConfig, imgTreeCanvas, mcc, pythia, options, canvas);
    canvas.save(`delphy-${getTimestampString()}.pdf`);
  });
}


function prepareAndDrawTree(mccRef: MccRef, mccConfig: MccConfig, imgTreeCanvas: MccTreeCanvas, mcc: SummaryTree, pythia: Pythia, options: ExportOptions, canvas: PdfCanvas | null = null) {
  const conf = mccRef.getNodeConfidence();
  if (!options.branchWidthByTips) imgTreeCanvas.uniformBranchWidth = true;

  if (mccConfig) {
    imgTreeCanvas.setConfig(mccConfig);
    mccConfig.updateInnerNodeMetadata(mcc);
  }

  imgTreeCanvas.positionTreeNodes(mcc, conf, pythia?.getAbsoluteMccIndex());
  imgTreeCanvas.setColors(mcc);
  const rootIndex = mcc.getRootIndex();
  const minDate = mcc.getTimeOf(rootIndex);
  const maxDate = pythia.maxDate;
  const timelineIndices = getTimelineIndices(minDate, maxDate);
  imgTreeCanvas.draw(minDate, maxDate, timelineIndices);
  if (canvas) imgTreeCanvas.draw(minDate, maxDate, timelineIndices, canvas);
}
