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

const treeWidth = 500;
const height = 750;

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
    mccRef.release();
  });
}

function prepareAndDrawTree(
  mccRef: MccRef,
  mccConfig: MccConfig,
  mcc: SummaryTree,
  pythia: Pythia,
  imgTreeCanvas: MccTreeCanvas,
  canvas: PdfCanvas | null = null,
  sizeBranchWidth: boolean,
  zoom: boolean
) {
  const conf = mccRef.getNodeConfidence();
  if (!sizeBranchWidth) {
    imgTreeCanvas.uniformBranchWidth = true;
  }
  if (zoom) {
    const { verticalZoom, zoomCenterX, zoomCenterY, horizontalZoom } = mccConfig;
    imgTreeCanvas.setZoom(verticalZoom, zoomCenterY, horizontalZoom, zoomCenterX)
  }

  imgTreeCanvas.setConfig(mccConfig);
  mccConfig.updateInnerNodeMetadata(mcc);
  imgTreeCanvas.positionTreeNodes(mcc, conf, pythia?.getAbsoluteMccIndex());
  imgTreeCanvas.setColors(mcc);
  const rootIndex = mcc.getRootIndex();
  const minDate = mcc.getTimeOf(rootIndex);
  const maxDate = pythia.maxDate;
  const timelineIndices = getTimelineIndices(minDate, maxDate);
  imgTreeCanvas.draw(minDate, maxDate, timelineIndices);
  if (canvas) imgTreeCanvas.draw(minDate, maxDate, timelineIndices, canvas);
}


function renderTreeToCanvas(
  pythia: Pythia,
  mccConfig: MccConfig,
  mcc: SummaryTree,
  mccRef: MccRef,
  options: ExportOptions,
  zoom: boolean,
  width: number,
  height: number,
  scale: number
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const tree = new MccTreeCanvas(c, ctx);
  c.width = width * scale;
  c.height = height * scale;
  tree.width = width;
  tree.height = height;
  ctx.scale(scale, scale);
  prepareAndDrawTree(mccRef, mccConfig, mcc, pythia, tree, null, options.branchWidthByTips, zoom);
  return c;
}

function exportPNG(pythia: Pythia, mccConfig: MccConfig, mcc: SummaryTree, mccRef: MccRef, options: ExportOptions) {
  const scale = 3;
  const panels = [renderTreeToCanvas(pythia, mccConfig, mcc, mccRef, options, false, treeWidth, height, scale)];
  if (options.includeZoom) {
    panels.push(renderTreeToCanvas(pythia, mccConfig, mcc, mccRef, options, true, treeWidth, height, scale));
  }

  const outCanvas = document.createElement('canvas');
  outCanvas.width = treeWidth * scale * panels.length;
  outCanvas.height = height * scale;
  const outctx = outCanvas.getContext('2d') as CanvasRenderingContext2D;
  panels.forEach((p, i) => outctx.drawImage(p, i * treeWidth * scale, 0));

  const a = document.createElement('a');
  a.href = outCanvas.toDataURL('image/png');
  a.download = `delphy-${getTimestampString()}.png`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 10000);
}

function exportPDF(pythia: Pythia, mccConfig: MccConfig, mcc: SummaryTree, mccRef: MccRef, options: ExportOptions) {
  const includeZoom = options.includeZoom;
  const canvas = new PdfCanvas(treeWidth * (includeZoom ? 2 : 1), height);
  const ctx = canvas.getContext();

  /*
    jspdf does not support .otf files, so we have these home made .ttf conversions
  */
  const promises: Promise<void>[] = [
    canvas.addFont('/assets/fonts/roboto/roboto-bold.ttf', 'Roboto', '700'),
    canvas.addFont('/assets/fonts/roboto/roboto-medium.ttf', 'Roboto', '500'),
  ];

  Promise.all(promises)
    .then(() => {
      const imgTreeCanvas = new MccTreeCanvas(canvas, ctx);
      imgTreeCanvas.width = treeWidth;
      imgTreeCanvas.height = height;
      prepareAndDrawTree(mccRef, mccConfig, mcc, pythia, imgTreeCanvas, canvas, options.branchWidthByTips, false);

      if (includeZoom) {
        const zoomedTreeCanvas = new MccTreeCanvas(canvas, ctx);
        zoomedTreeCanvas.width = treeWidth;
        zoomedTreeCanvas.height = height;
        ctx.save();
        ctx.translate(treeWidth, 0);
        prepareAndDrawTree(mccRef, mccConfig, mcc, pythia, zoomedTreeCanvas, canvas, options.branchWidthByTips, true);
        ctx.restore();
      }

      canvas.save(`delphy-${getTimestampString()}.pdf`);
    })
    .catch((err) => console.error('PDF export failed', err));
}