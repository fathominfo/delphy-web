import { Protocol } from 'pmtiles';
import * as maplibregl from 'maplibre-gl';
import { ALL_SELECTED_LAYERS } from './layerconfig';

export default class VectorMap {
  containerId: string;
  static map: maplibregl.Map | null;

  constructor(containerId: string) {
    this.containerId = containerId;
    // this.bbox = null;
  }

  init() {
    if (VectorMap.map) {
      this.map = VectorMap.map;
      return;
    }
    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);

    this.map = new maplibregl.Map({
      container: this.containerId,
      style: `./protomaps_style_theme_4.json`,
      center: [0, 0],
      zoom: 1
    });

    this.map.on("load", () => {
      this.map?.addSource("admin", {
        type: "vector",
        url: "pmtiles:///adm1.pmtiles",
        promoteId: {
          adm1: "shapeName"
        }
      });

      this.onMapLoad();
    });
  }

  get map() {
    return VectorMap.map;
  }

  set map(value: maplibregl.Map | null) {
    VectorMap.map = value;
  }

  onMapLoad() {
    if (!this.map) return;
    const allLayerIds = this.map?.getStyle().layers.map(layer => layer.id);

    allLayerIds.forEach(layerId => {
      if (ALL_SELECTED_LAYERS.includes(layerId)) {
        this.map?.setLayoutProperty(layerId, 'visibility', 'visible');
      } else {
        this.map?.setLayoutProperty(layerId, 'visibility', 'none');
      }
    });

    this.map.addLayer(
      {
        id: "adm1-fill",
        type: "fill",
        source: "admin",
        "source-layer": "adm1",
        paint: {
          "fill-color": "#34376b",
          "fill-opacity": 1.0,
          "fill-outline-color": "#444"
        }
      }, "places_region")
  }

  colorMapTally(tally: Record<string, number>) {
    const colorMap = () => {
      console.log("coloring map by tally...");
      // console.log(tally)
      const features = this.map?.querySourceFeatures("admin", {
        sourceLayer: "adm1"
      });

      if (!features || features.length === 0) return;

      features.forEach(feature => {
        const name = feature.properties?.shapeName;

        if (name && name in tally) {
          this.map?.setFeatureState(
            {
              source: "admin",
              sourceLayer: "adm1",
              id: name
            },
            {
              tally: tally[name]
            }
          );
        }
      });

      this.map?.setPaintProperty("adm1-fill", "fill-color",
        [
          "case",
          [
            "!",
            [
              "match",
              ["get", "shapeGroup"],
              ["SLE", "LBR", "GIN"],
              true,
              false
            ]
          ],
          "#cccccc",

          [
            "interpolate",
            ["linear"],
            ["coalesce", ["feature-state", "tally"], 0],
            0, "#eeeeee",
            5, "#ffffcc",
            10, "#fed976",
            50, "#fd8d3c",
            100, "#f03b20",
            500, "#bd0026"
          ]
        ]
      );
    };

    const sourceLoaded = (e: maplibregl.MapSourceDataEvent) => {
      if (
        e.sourceId === "admin" && e.isSourceLoaded
      ) {
        colorMap();
        this.map?.off("sourcedata", sourceLoaded);
      }
    };
    this.map?.on("sourcedata", sourceLoaded);
  }
}