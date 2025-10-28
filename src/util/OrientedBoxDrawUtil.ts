import {OrientedBox} from "@luciad/ria/shape/OrientedBox.js";
import type {GeoCanvas} from "@luciad/ria/view/style/GeoCanvas.js";
import {OcclusionMode} from "@luciad/ria/view/style/OcclusionMode.js";
import {Polygon} from "@luciad/ria/shape/Polygon.js";
import type {Vector3} from "@luciad/ria/util/Vector3.js";
import {WebGLMap} from "@luciad/ria/view/WebGLMap.js";
import {Point} from "@luciad/ria/shape/Point.js";
import {createCartesianGeodesy, createEllipsoidalGeodesy,} from "@luciad/ria/geodesy/GeodesyFactory.js";
import type {Icon3DStyle} from "@luciad/ria/view/style/Icon3DStyle.js";
import {LineType} from "@luciad/ria/geodesy/LineType.js";
import {getReference} from "@luciad/ria/reference/ReferenceProvider.js";
import {createTransformation} from "@luciad/ria/transformation/TransformationFactory.js";
import {CoordinateReference} from "@luciad/ria/reference/CoordinateReference.js";
import {create3DCube} from "./mesh/Simplified3DMeshFactory.js";

export const VOLUME_MEASUREMENT_OUTLINE_COLOR = "rgb(212,226,243)";
export const VOLUME_MEASUREMENT_OUTLINE_COLOR_HIDDEN = "rgba(156,196,241,0.2)";
export const VOLUME_MEASUREMENT_POINT_COLOR = "rgb(18,67,122)";

const FILL_COLOR = "rgba(171,232,229, 0.3)";


const IconStyle3D: Icon3DStyle = {
  mesh: create3DCube(1),
  color: "rgba(255,255,255,1)",
  rotation: {
    x: 0,
    y: 0,
    z: 0
  },
  translation: {
    x: 0,
    y: 0,
    z: 0
  },
  scale: {
    x: 1,
    y: 1,
    z: 1
  },
  legacyAxis: false
};


export interface DrawBoxOptions {
  hightlighted?: boolean;
  withOccludedPart?: boolean;
  fillColor?: string;
  strokeColor?: string;
}

/**
 * Draws the given box on the given canvas
 */
export function drawBox(geoCanvas: GeoCanvas, box: OrientedBox, options?: DrawBoxOptions) {
  const highlighted = !!options?.hightlighted;
  const withOccludedPart = !!options?.withOccludedPart;

  geoCanvas.drawShape(box, {
    stroke: {
      width: highlighted ? 4 : 2,
      color: options?.strokeColor ? options.strokeColor : VOLUME_MEASUREMENT_OUTLINE_COLOR,
    },
    fill: highlighted ? {
      color: options?.fillColor ? options?.fillColor : FILL_COLOR,
    } : undefined
  });

  if (withOccludedPart) {
    geoCanvas.drawShape(box, {
      stroke: {
        width: highlighted ? 4 : 2,
        color: VOLUME_MEASUREMENT_OUTLINE_COLOR_HIDDEN
      },
      fill: highlighted ? {
        color: FILL_COLOR,
      } : undefined,
      occlusionMode: OcclusionMode.OCCLUDED_ONLY
    });
  }
}

/**
 * Draws the given box face on the given canvas
 */
export function drawFacePolygon(geoCanvas: GeoCanvas, polygon: Polygon, hovered: boolean) {
  geoCanvas.drawShape(polygon, {
    stroke: {
      width: hovered ? 4 : 2,
      color: VOLUME_MEASUREMENT_OUTLINE_COLOR
    },
    fill: hovered ? {
      color: FILL_COLOR,
    } : undefined
  });
}

export function paintRefinedVolume(_map: WebGLMap,
                                   geoCanvas: GeoCanvas, box: OrientedBox,
                                   emptyVolumes: number[][],
                                   dimensions:{width: number, depth: number, height:number},
                                   _orientation: Vector3, RefinedGridSize: number ) {
  if (emptyVolumes.length === 0) return;

  const cornerPoints = box.getCornerPoints(); // 0..7

  // Bottom face corners
  const bottom1 = cornerPoints[1]; // top-left
  const bottom5 = cornerPoints[5]; // bottom-left
  const bottom3 = cornerPoints[3]; // top-right
  const bottom7 = cornerPoints[7]; // bottom-right

  // const GEODESY = createEllipsoidalGeodesy(box.reference);
  const GEODESY = createCartesianGeodesy(box.reference as CoordinateReference);

  const halfStep = 0.5 / RefinedGridSize; // precompute shift
  const step = 1 / RefinedGridSize;

  const azimuth = getAzimuth(bottom1, bottom5, dimensions.depth);

  for (let i = 0; i < RefinedGridSize; i++) {
    const t = step * (i) + halfStep;

    // Interpolate vertical edges once per row
    const leftPoint = GEODESY.interpolate(bottom1, bottom5, t );
    const rightPoint = GEODESY.interpolate(bottom3, bottom7, t );

    const miniBox = {
      width: Math.abs(dimensions.width) / RefinedGridSize,
      depth: Math.abs(dimensions.depth) / RefinedGridSize,
      height: Math.abs(dimensions.height)
    }

    for (let j = 0; j < RefinedGridSize; j++) {
      const s = step * (j) + halfStep;
      const pointHeight = miniBox.height - emptyVolumes[i][j];
      const roundedHeight = pointHeight < 0 ? 0 : Math.round(pointHeight * 100) / 100;
      const centerPoint = GEODESY.interpolate(leftPoint, rightPoint, s );

      const targetHeight =  roundedHeight === 0 ? 0.001 : roundedHeight;

      const icon3dStyle: Icon3DStyle = {
        ...IconStyle3D,
        color: "#FF6347",
        scale: {x: miniBox.width, y: miniBox.depth, z: targetHeight},
        translation: {x:0, y:0, z: targetHeight / 2},
        rotation: {x: 0, y: 0, z: azimuth }
      }
      geoCanvas.drawIcon3D(centerPoint, icon3dStyle);
    }
  }
}

function getAzimuth(pointA: Point, pointB: Point, depth: number) {
  const A = reprojectPoint(pointA);
  const B = reprojectPoint(pointB);
  if (A && B) {
      const GEODESY = createEllipsoidalGeodesy(A?.reference as CoordinateReference);
      const angle = - GEODESY.forwardAzimuth(A, B, LineType.SHORTEST_DISTANCE);
      return depth < 0 ? angle + 90 : angle;
  } else {
      return 0
  }
}


function reprojectPoint(shape: Point, targetProjection?: string) {
    // When no targetProjection Specified then default to CRS:84 (EPSG:4326);
    targetProjection =  targetProjection ?  targetProjection : "EPSG:4326";
    targetProjection = targetProjection==="CRS:84" ? "EPSG:4326" : targetProjection;
    const sourceProjection = shape.reference?.name === "WGS_1984" && shape.reference.identifier.includes("CRS84") ? "EPSG:4326" : shape.reference?.identifier;
    if ( sourceProjection === targetProjection) {
        return shape;
    } else {
        const targetReference = getReference(targetProjection);
        const transformer = createTransformation(shape.reference as CoordinateReference, targetReference);
        try {
            return transformer.transform(shape);
        } catch (_e) {
            return null;
        }
    }
}
