import { Context2d } from "jspdf";
import { SummaryTree } from "./pythia/delphy_api";
import { MccRef } from "./pythia/mccref";
import { Pythia } from "./pythia/pythia";
import { SharedState } from "./sharedstate";
import { ColorOption, getDenseTimelineIndices, getTimestampString, TREE_PADDING_LEFT, TREE_TEXT_TOP } from "./ui/common";
import { MccConfig } from "./ui/mccconfig";
import { MccTreeCanvas } from "./ui/mcctreecanvas";
import { PdfCanvas } from "./util/pdfcanvas";


type ExportOptions = {
  colorOption: string,
  // includeZoom: boolean,
  // includeNodes: boolean,
  branchWidthByTips: boolean
}

type LegendBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LegendOptions = {
  fontSize: number, lineHeight: number, applyFont?: (ctx: Context2d | CanvasRenderingContext2D, fontSize: number) => void;
}

const pdf_dimensions = {
  landscape: {
    width: 1200,
    height: 800,
    margin: {
      top: 60,
      bottom: 20,
      left: 40,
      right: 40
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

const PADDING = 10;

const UI_COLORS = {
  title: "#111"
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
      // includeNodes: formData.has("selected-nodes"),
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



function measure(ctx: Context2d | CanvasRenderingContext2D, text: string): number {
  return (ctx.measureText(text) as unknown as { width: number }).width;
}

export function drawLegend(
  ctx: Context2d | CanvasRenderingContext2D,
  entries: Map<string, string>, // label -> color
  bounds: LegendBounds,
  options: LegendOptions
): void {
  const { fontSize, lineHeight, applyFont } = options;
  const labels = [...entries.keys()];
  if (labels.length === 0) return;

  ctx.save();

  if (applyFont) {
    applyFont(ctx, fontSize);
  } else {
    (ctx as CanvasRenderingContext2D).font = `${fontSize}px Roboto, sans-serif`;
  }

  const boxSize = lineHeight / 5;
  const textOffset = boxSize * 2;

  const longestLabelWidth = labels.reduce((max, l) => Math.max(max, measure(ctx, l)), 0) * 0.7;
  const columnWidth = textOffset + longestLabelWidth ;

  const rowsPerColumn = Math.max(1, Math.floor(bounds.height / lineHeight));
  const columns = Math.ceil(labels.length / rowsPerColumn);
  const visibleRows = Math.min(labels.length, rowsPerColumn);

  const legendWidth = columns * columnWidth;
  const legendHeight = visibleRows * lineHeight;

  // center the legend inside the bounds
  const left = bounds.x + Math.max(0, (bounds.width - legendWidth) / 2);
  const top = bounds.y + Math.max(0, (bounds.height - legendHeight) / 2);

  ctx.textAlign = 'left';

  labels.forEach((label, i) => {
    const column = Math.floor(i / rowsPerColumn);
    const row = i % rowsPerColumn;

    const baselineY = top + row * lineHeight + lineHeight * 0.75;
    const colX = left + column * columnWidth;

    ctx.fillStyle = entries.get(label)!;
    ctx.fillRect(colX, baselineY - boxSize, boxSize, boxSize);
    ctx.fillText(label, colX + textOffset, baselineY);
  });

  ctx.restore();
}

function drawTreeOnCanvas(
  mccRef: MccRef,
  mccConfig: MccConfig,
  mcc: SummaryTree,
  pythia: Pythia,
  imgTreeCanvas: MccTreeCanvas,
  sizeBranchWidth: boolean,
  zoom: boolean,
  pdfCanvas: PdfCanvas | null = null,
  ctx: Context2d | null = null
) {
  const conf = mccRef.getNodeConfidence();
  if (!sizeBranchWidth) {
    imgTreeCanvas.uniformBranchWidth = true;
  }
  if (zoom) {
    const { verticalZoom, zoomCenterX, zoomCenterY, horizontalZoom } = mccConfig;
    imgTreeCanvas.setZoom(verticalZoom, zoomCenterY, horizontalZoom, zoomCenterX);
  }
  imgTreeCanvas.setConfig(mccConfig);
  mccConfig.updateInnerNodeMetadata(mcc);

  imgTreeCanvas.setTipLabelsType(mccConfig.colorOption);
  imgTreeCanvas.positionTreeNodes(mcc, conf, pythia?.getAbsoluteMccIndex());
  imgTreeCanvas.setColors(mcc);

  const rootIndex = mcc.getRootIndex();
  const minDate = mcc.getTimeOf(rootIndex);
  const maxDate = pythia.maxDate;
  const timelineIndices = getDenseTimelineIndices(minDate, maxDate);

  if (pdfCanvas && ctx) {
    if (zoom) {
      ctx.beginPath();
      ctx.rect(0, 0, imgTreeCanvas.width, imgTreeCanvas.height);
      ctx.clip();
    }
    imgTreeCanvas.draw(minDate, maxDate, timelineIndices, pdfCanvas);
  } else {
    imgTreeCanvas.draw(minDate, maxDate, timelineIndices);
  }
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
): { canvas: HTMLCanvasElement; tree: MccTreeCanvas } {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const tree = new MccTreeCanvas(c, ctx);
  c.width = width * scale;
  c.height = height * scale;
  tree.width = width;
  tree.height = height;
  ctx.scale(scale, scale);
  drawTreeOnCanvas(mccRef, mccConfig, mcc, pythia, tree, options.branchWidthByTips, zoom);
  return { canvas: c, tree };
}

function exportPNG(pythia: Pythia, mccConfig: MccConfig, mcc: SummaryTree, mccRef: MccRef, options: ExportOptions) {
  const { width, height, margin } = pdf_dimensions.landscape;
  const { horizontalZoom, verticalZoom } = mccConfig;
  const isZoomed = verticalZoom > 1 || horizontalZoom > 1;

  const scale = 3;
  const { canvas: mccTreeCanvas, tree } = renderTreeToCanvas(
    pythia, mccConfig, mcc, mccRef, options, false, width / 2, height, scale
  );

  const outCanvas = document.createElement('canvas');
  outCanvas.width = width * scale;
  outCanvas.height = height * scale;
  const outctx = outCanvas.getContext('2d') as CanvasRenderingContext2D;
  outctx.fillStyle = '#fff';
  outctx.fillRect(0, 0, width * scale, height * scale);
  outctx.drawImage(mccTreeCanvas, margin.left * scale, margin.top * scale);

  if (isZoomed) {
    const { canvas: zoomedCanvas } = renderTreeToCanvas(
      pythia, mccConfig, mcc, mccRef, options, true, width / 2, height, scale
    );

    outctx.drawImage(zoomedCanvas, (margin.left + width / 2 + PADDING) * scale, margin.top * scale);
  } else if (mccConfig.colorOption === ColorOption.metadata) {
    const legendBounds: LegendBounds = {
      x: margin.left + width / 2 + PADDING,
      y: margin.top,
      width: width / 2 - margin.left - margin.right - PADDING,
      height: height - margin.top - margin.bottom,
    };
    outctx.save();
    outctx.scale(scale, scale);
    drawLegend(outctx, tree.getLegendColors(), legendBounds, { fontSize: 18, lineHeight: 20 });
    outctx.restore();
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
  const canvas = new PdfCanvas(width, height, 'landscape');
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
      const drawLegendToPage = (legendBounds: LegendBounds, treeCanvas: MccTreeCanvas) => {
        drawLegend(ctx, treeCanvas.getLegendColors(), legendBounds, {
          fontSize: 18,
          lineHeight: 20,
          applyFont: (_, size) => {
            canvas.setFont("Roboto", "500")
            canvas.setFontSize(size)}
        });
      }

      const imgTreeCanvas = new MccTreeCanvas(canvas, ctx);
      ctx.save();
      ctx.translate(margin.left, margin.top);
      ctx.fillStyle = UI_COLORS.title;
      canvas.drawTitle('Maximum Clade Credibility Tree');
      ctx.translate(0, PADDING);

      const drawingWidth = width - margin.left - margin.right;
      const drawingHeight = height - margin.top - margin.bottom - PADDING;

      imgTreeCanvas.width = drawingWidth / 2;
      imgTreeCanvas.height = drawingHeight;
      drawTreeOnCanvas(mccRef, mccConfig, mcc, pythia, imgTreeCanvas, options.branchWidthByTips, false, canvas, ctx);

      if (mccConfig.colorOption === ColorOption.metadata){
        const bounds: LegendBounds = {
          x: imgTreeCanvas.width + PADDING,
          y: 0,
          width: drawingWidth / 2 - PADDING,
          height: drawingHeight,
        };
        drawLegendToPage(bounds,imgTreeCanvas);
      }

      ctx.restore();

      const { verticalZoom, horizontalZoom } = mccConfig;
      if (verticalZoom > 1 || horizontalZoom > 1) {
        canvas.doc.addPage();

        //========= MINI TREE MAP (full tree) =====
        const miniTreeMap = new MccTreeCanvas(canvas, ctx);
        miniTreeMap.width = drawingWidth / 5;
        miniTreeMap.height = drawingHeight / 2;

        ctx.save();
        ctx.translate(margin.left, margin.top);
        ctx.fillStyle = UI_COLORS.title;
        canvas.drawTitle('MCC Tree (selected area)');
        ctx.translate(0, PADDING);
        drawTreeOnCanvas(mccRef, mccConfig, mcc, pythia, miniTreeMap, options.branchWidthByTips, false, canvas, ctx);
        ctx.restore();

        //========= ZOOMED IN AREA =====
        const zoomedTreeCanvas = new MccTreeCanvas(canvas, ctx);
        zoomedTreeCanvas.width = drawingWidth / 3;
        zoomedTreeCanvas.height = drawingHeight;

        ctx.save();
        ctx.translate(margin.left + miniTreeMap.width + PADDING * 2, margin.top);
        ctx.fillStyle = UI_COLORS.title;
        ctx.translate(0, PADDING);
        ctx.beginPath();
        ctx.rect(0, 0, zoomedTreeCanvas.width, zoomedTreeCanvas.height);
        ctx.clip();
        drawTreeOnCanvas(mccRef, mccConfig, mcc, pythia, zoomedTreeCanvas, options.branchWidthByTips, true, canvas, ctx);
        ctx.restore();

        //========= SELECTION on MINI TREE =====
        const bbox = zoomedTreeCanvas.getZoomBoundsNormalized();
        const miniArea = miniTreeMap.getTreeArea();

        const MIN_BOX = 1;
        const rw = Math.max(MIN_BOX, bbox.width * miniArea.width);
        const rh = Math.max(MIN_BOX, bbox.height * miniArea.height);
        const rx = Math.min(miniArea.x + bbox.x * miniArea.width, miniArea.x + miniArea.width - rw);
        const ry = Math.min(miniArea.y + bbox.y * miniArea.height, miniArea.y + miniArea.height - rh);

        const pdf = canvas.doc;

        pdf.saveGraphicsState();
        //@ts-expect-error GState isn't in the typings
        pdf.setGState(new pdf.GState({ opacity: 0.7 }));
        pdf.setFillColor(255, 255, 255);
        pdf.rect(margin.left, margin.top + PADDING, miniTreeMap.width, miniTreeMap.height, 'F');
        pdf.restoreGraphicsState();

        ctx.save();
        ctx.translate(margin.left, margin.top + PADDING);

        ctx.save();
        ctx.beginPath();
        ctx.rect(rx, ry, rw, rh);
        ctx.clip();
        drawTreeOnCanvas(mccRef, mccConfig, mcc, pythia, miniTreeMap, options.branchWidthByTips, false, canvas, ctx);
        ctx.restore();

        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1;
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.restore();

        if (mccConfig.colorOption === ColorOption.metadata) {
          const bounds: LegendBounds = {
            x: miniTreeMap.width + zoomedTreeCanvas.width + PADDING,
            y: margin.top,
            width: drawingWidth - (miniTreeMap.width + zoomedTreeCanvas.width + PADDING),
            height: drawingHeight,
          };
          drawLegendToPage(bounds, zoomedTreeCanvas);
        }
      }

      canvas.save(`delphy-${getTimestampString()}.pdf`);
    })
    .catch((err) => console.error('PDF export failed', err));
}