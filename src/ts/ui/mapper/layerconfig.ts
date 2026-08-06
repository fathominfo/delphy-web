export const BASE_LAYERS = ['background', 'earth'];

export const LAYER_GROUPS = {
  // greenery: ['landuse_park', 'landuse_urban_green'],

  // landuse: ['landuse_hospital', 'landuse_industrial', 'landuse_school', 'landuse_beach', 'landuse_zoo', 'landuse_aerodrome'],

  // minorRoads: ['road_bridges_minor', 'road_bridges_minor_casing', 'roads_minor_casing', 'roads_minor_service_casing', 'roads_minor_service','roads_minor', 'roads_tunnels_minor_casing', 'roads_tunnels_minor'],
  // majorRoads: ['road_bridges_major', 'road_bridges_major_casing_late', 'road_bridges_major_casing_early', 'roads_major_casing', 'roads_major_service_casing', 'roads_major_service','roads_major', 'roads_tunnels_major','roads_tunnels_major_casing'],
  // highways: ['road_bridges_highway', 'road_bridges_highway_casing', 'roads_highway_casing_early', 'roads_highway_casing_late', 'roads_highway', 'roads_tunnels_highway', 'roads_tunnels_highway_casing'],
  // linkRoads: ['road_bridges_link', 'road_bridges_link_casing', 'roads_link_casing', 'roads_link', 'roads_tunnels_link', 'roads_tunnels_link_casing'],
  // otherRoads: ['road_bridges_other', 'road_bridges_other_casing', 'roads_other_casing', 'roads_other', 'roads_tunnels_other', 'roads_tunnels_other_casing'],
  // roadLabels: ['roads_labels_minor', 'roads_labels_major'],

  regionLabels: ['places_region'],
  placeLabels: ['places_locality', 'places_subplace'],
  countryLabels: ['places_country'],

  // buildings: ['buildings'],

  water: ['water'],

  // waterLabels: ['water_label_ocean', 'water_label_lakes', 'water_waterway_label'],

  stateLines: ['boundaries'],
  countrybBoundaries: ['boundaries_country']
};

export const ALL_SELECTED_LAYERS = [
  ...BASE_LAYERS,
  ...Object.values(LAYER_GROUPS).flat()
];