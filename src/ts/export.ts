import { SummaryTree } from "./pythia/delphy_api";
import { MccRef } from "./pythia/mccref";
import { Pythia } from "./pythia/pythia";
import { SharedState } from "./sharedstate";
import { ColorOption, getDenseTimelineIndices, getTimestampString } from "./ui/common";
import { MccConfig } from "./ui/mccconfig";
import { MccTreeCanvas } from "./ui/mcctreecanvas";
import { PdfCanvas } from "./util/pdfcanvas";


type ExportOptions = {
  colorOption: string,
  includeZoom: boolean,
  includeNodes: boolean,
  branchWidthByTips: boolean
}

const pdf_dimensions = {
  landscape: {
    width: 1200,
    height: 800,
    margin: {
      top: 20,
      bottom: 20,
      left: 20,
      right: 20
    }
  },
  portrait: {
    width: 612,
    height: 792,
    margin: {
      top: 20,
      bottom: 20,
      left: 20,
      right: 20
    }
  }
}
const PADDING = 30;

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

  //TODO: crop the canvas
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
  const timelineIndices = getDenseTimelineIndices(minDate, maxDate);
  if (canvas) imgTreeCanvas.draw(minDate, maxDate, timelineIndices, canvas);
  else imgTreeCanvas.draw(minDate, maxDate, timelineIndices);
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
  const { width, height, margin } = pdf_dimensions.landscape;
  const { horizontalZoom, verticalZoom } = mccConfig;

  const scale = 3;
  const mccTreeCanvas = renderTreeToCanvas(pythia, mccConfig, mcc, mccRef, options, false, width / 2, height, scale);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = width * scale;
  outCanvas.height = height * scale;
  const outctx = outCanvas.getContext('2d') as CanvasRenderingContext2D;
  outctx.fillStyle = "#fff";
  outctx.fillRect(0, 0, width * scale, height * scale);
  outctx.drawImage(mccTreeCanvas, margin.left * scale, margin.top * scale);

  if (options.includeZoom && (verticalZoom > 1 || horizontalZoom > 1)) {
    // include zoom
    const zoomedCanvas = renderTreeToCanvas(pythia, mccConfig, mcc, mccRef, options, true, width / 2, height, scale);
    outctx.drawImage(zoomedCanvas, (margin.left + width / 2 + PADDING) * scale, margin.top * scale);
  }

  const a = document.createElement('a');
  a.href = outCanvas.toDataURL('image/png');
  a.download = `delphy-${getTimestampString()}.png`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 10000);
}

function exportPDF(pythia: Pythia, mccConfig: MccConfig, mcc: SummaryTree, mccRef: MccRef, options: ExportOptions) {
  const { width, height, margin } = pdf_dimensions.landscape;
  const includeZoom = options.includeZoom;
  const canvas = new PdfCanvas(width, height, "landscape");
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
      imgTreeCanvas.width = (width - margin.left - margin.right) / 2;
      imgTreeCanvas.height = height;
      ctx.translate(margin.left, margin.top);
      prepareAndDrawTree(mccRef, mccConfig, mcc, pythia, imgTreeCanvas, canvas, options.branchWidthByTips, false);
      ctx.restore();

      const { verticalZoom, horizontalZoom } = mccConfig;
      if (includeZoom && (verticalZoom > 1 || horizontalZoom > 1)) {
        // landscape
        const zoomedTreeCanvas = new MccTreeCanvas(canvas, ctx);
        zoomedTreeCanvas.width = width / 4;
        zoomedTreeCanvas.height = height / 2;
        ctx.save();
        ctx.translate(margin.left + width / 2 + PADDING, margin.top);
        prepareAndDrawTree(mccRef, mccConfig, mcc, pythia, zoomedTreeCanvas, canvas, options.branchWidthByTips, true);
        ctx.restore();
      }

      canvas.save(`delphy-${getTimestampString()}.pdf`);
    })
    .catch((err) => console.error('PDF export failed', err));
}