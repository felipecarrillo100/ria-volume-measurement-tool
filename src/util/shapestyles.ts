import type {IconStyle} from "@luciad/ria/view/style/IconStyle.js";
import {OcclusionMode} from "@luciad/ria/view/style/OcclusionMode.js";
import {Shape} from "@luciad/ria/shape/Shape.js";
import type {GeoCanvas} from "@luciad/ria/view/style/GeoCanvas.js";
import {
    VOLUME_MEASUREMENT_OUTLINE_COLOR,
    VOLUME_MEASUREMENT_OUTLINE_COLOR_HIDDEN,
    VOLUME_MEASUREMENT_POINT_COLOR
} from "./OrientedBoxDrawUtil.js";
import type {ShapeStyle} from "@luciad/ria/view/style/ShapeStyle.js";
import {Point} from "@luciad/ria/shape/Point.js";
import {createCircle} from "@luciad/ria-toolbox-core/util/IconFactory.js";

// To import icons without loader
import {resizeIconInSVG} from "./resizeIconInSVG";

const HANDLE_STYLE: IconStyle = {
    url: resizeIconInSVG,
    width: '40px',
    height: '40px',
    occlusionMode: OcclusionMode.ALWAYS_VISIBLE,
}

const POINT_STYLE: IconStyle = {
    image: createCircle({
        fill: "rgba(217, 217, 217, 0.8)",
        width: 18,
        height: 18,
        stroke: VOLUME_MEASUREMENT_POINT_COLOR, // "rgb(255, 255, 255)",
        strokeWidth: 2
    }),
    width: `${18}px`,
    height: `${18}px`
};

const POINT_STYLE_HIDDEN: IconStyle = {
    image: createCircle({
        fill: "rgba(217, 217, 217, 0.2)",
        width: 18,
        height: 18,
        stroke: VOLUME_MEASUREMENT_POINT_COLOR, // "rgb(255, 255, 255)",
        strokeWidth: 2
    }),
    width: `${18}px`,
    height: `${18}px`,
    occlusionMode: OcclusionMode.OCCLUDED_ONLY
}

const LINE_STYLE: ShapeStyle = {
    stroke: {
        color: VOLUME_MEASUREMENT_OUTLINE_COLOR, // "rgba(218, 218, 218, 0.8)",
        width: 2,
    }
}

const LINE_STYLE_HIDDEN: ShapeStyle = {
    stroke: {
        color: VOLUME_MEASUREMENT_OUTLINE_COLOR_HIDDEN, //"rgba(218, 218, 218, 0.2)",
        width: 2
    },
    occlusionMode: OcclusionMode.OCCLUDED_ONLY
}

const PLANE_STYLE: ShapeStyle = {
    fill: {
        color: "rgba(171, 232, 229, 0.4)"
    }
}

const PLANE_STYLE_HIDDEN: ShapeStyle = {
    fill: {
        color: "rgba(171, 232, 229, 0.1)"
    },
    occlusionMode: OcclusionMode.OCCLUDED_ONLY
}

export const VolumeMeasureStyles =  {
    POINT_STYLE,
    POINT_STYLE_HIDDEN,
    LINE_STYLE,
    LINE_STYLE_HIDDEN,
    PLANE_STYLE,
    PLANE_STYLE_HIDDEN
}

export function drawHandleResize(geoCanvas: GeoCanvas, shape: Shape, hovered?: boolean ) {
    if (hovered) {
        const hoverColor = "rgb(116,207,221)";       // soft blue highlight for hover
        geoCanvas.drawIcon(shape.focusPoint as Point, {...HANDLE_STYLE, occlusionMode: OcclusionMode.VISIBLE_ONLY, modulationColor: hoverColor});
        geoCanvas.drawIcon(shape.focusPoint as Point, {...HANDLE_STYLE, occlusionMode: OcclusionMode.OCCLUDED_ONLY, modulationColor: hoverColor});
    } else {
        geoCanvas.drawIcon(shape.focusPoint as Point, {...HANDLE_STYLE, occlusionMode: OcclusionMode.VISIBLE_ONLY});
        geoCanvas.drawIcon(shape.focusPoint as Point, {...HANDLE_STYLE, occlusionMode: OcclusionMode.OCCLUDED_ONLY});
    }
}
