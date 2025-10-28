// VolumeMeasureController.ts
import {getReference} from "@luciad/ria/reference/ReferenceProvider.js";
import type {GeoCanvas} from "@luciad/ria/view/style/GeoCanvas.js";
import {createOrientedBox, createPoint, createPolygon, createPolyline} from "@luciad/ria/shape/ShapeFactory.js";
import type {Vector3} from "@luciad/ria/util/Vector3.js";
import {
    add,
    addArray,
    angle,
    cross,
    distance,
    distanceAlongDirection,
    normalize,
    rayPlaneIntersection,
    rayRectangleIntersection,
    rotateAroundAxis,
    rotatePointAroundLine,
    scale,
    sub,
    toPoint
} from "@luciad/ria-toolbox-core/util/Vector3Util.js";
import {clamp} from "@luciad/ria-toolbox-core/util/Math.js";
import {createFacePolygons} from "@luciad/ria-toolbox-core/util/AdvancedShapeFactory.js";
import {
    ALTITUDE_CHANGED_EVENT,
    GeolocateHandleSupport,
    MOVED_EVENT,
    ROTATED_EVENT,
    STYLE_UPDATED_EVENT
} from "@luciad/ria-toolbox-geolocation/GeolocateHandleSupport.js";

import {createTransformationFromGeoLocation} from "@luciad/ria/transformation/Affine3DTransformation.js";
import type {GestureEvent} from "@luciad/ria/view/input/GestureEvent.js";
import {EVENT_HANDLED, EVENT_IGNORED, HandleEventResult} from "@luciad/ria/view/controller/HandleEventResult.js";
import {GestureEventType} from "@luciad/ria/view/input/GestureEventType.js";
import {LocationMode} from "@luciad/ria/transformation/LocationMode.js";
import {PerspectiveCamera} from "@luciad/ria/view/camera/PerspectiveCamera.js";
import {OutOfBoundsError} from "@luciad/ria/error/OutOfBoundsError.js";
import {EventedSupport} from "@luciad/ria/util/EventedSupport.js";
import type {Handle} from "@luciad/ria/util/Evented.js";
import {drawBox, paintRefinedVolume,} from "./util/OrientedBoxDrawUtil.js";
import {ModifierType} from "@luciad/ria/view/input/ModifierType.js";
import {KeyEvent} from "@luciad/ria/view/input/KeyEvent.js";
import type {LabelCanvas} from "@luciad/ria/view/style/LabelCanvas.js";
import DistanceUnit, {ENUM_DISTANCE_UNIT} from "./util/DistanceUnit.js";

import {Polygon} from "@luciad/ria/shape/Polygon.js";
import {OrientedBox} from "@luciad/ria/shape/OrientedBox.js";
import {createCartesianGeodesy} from "@luciad/ria/geodesy/GeodesyFactory.js";
import {setCameraLocation} from "./util/setCameraLocation.js";
import {hideBlockingBanner, showBlockingBanner, updateBlockingBannerProgress} from "./blockingBanner.js";
import {WebGLMap} from "@luciad/ria/view/WebGLMap.js";
import {Map} from "@luciad/ria/view/Map.js";
import {drawHandleResize, VolumeMeasureStyles} from "./util/shapestyles.js";

import {calculatePointingDirection} from "@luciad/ria-toolbox-core/util/PerspectiveCameraUtil.js";
import {CoordinateReference} from "@luciad/ria/reference/CoordinateReference.js";
import {Controller} from "@luciad/ria/view/controller/Controller.js";
import {Point} from "@luciad/ria/shape/Point.js";
import {length} from "@luciad/ria-toolbox-core/src/util/Vector3Util";

const ResizeHandleIconSize = 20;

enum CreationState {
    IDLE,
    CORNER_DEFINED,
    WIDTH_DEFINED,
    PLANE_DEFINED,
    VOLUME_DEFINED,
    FACE_RESIZING = 5,
    RESIZE_ROTATE = 6,
}


/**
 * Event that is emitted when a box has been fully defined. The created box is returned together with this event.
 */
export const VOLUME_MEASUREMENT_UPDATE = "VolumeMeasurementUpdate";
export const VOLUME_MEASUREMENT_READY = "VolumeMeasurementReady";
export const VOLUME_MEASUREMENT_END = "VolumeMeasurementEnd";


const RefinedGridSize = 24;

/**
 * Max side length in meters, to avoid issues with the fact that oriented boxes do not curve with the earth
 */
const MAX_SIZE = 10_000;

/**
 * Controller used to create an oriented box through 4 clicks. The 4 clicks define:
 * <ol>
 *  <li>A first corner point</li>
 *  <li>A second corner point at the same height as the first one and adjacent to the first corner.</li>
 *  <li>A third corner point at the same height as the last two points, opposite to the first corner.</li>
 *  <li>A fourth corner point straight above or under the third corner point. If the shift modifier key is held down,
 *  the first three points are instead defining the center plane of the bo </li>
 * </ol>
 *
 * Together, these 4 corner points define exactly one oriented box, which is returned when the {@link BOX_CREATED_EVENT}
 * event is emitted.
 */

export interface VolumeMeasurementEvent {
    width: number; // meters
    depth: number; // meters
    height: number; // meters
    area: number; // meters2
    volume: number; // meters³
    units: ENUM_DISTANCE_UNIT;
    factor: number; // conversion factor to units
    widthAsText: string; // meters
    depthAsText: string; // meters
    heightAsText: string; // meters
    areaAsText: string; // meters
    volumeAsText: string; // meters³
    canRefine: boolean;
    refinedVolume: number;
    refinedVolumeText: string;
}

export interface VolumeMeasurementCompleteEvent extends VolumeMeasurementEvent {
    box: OrientedBox;
}

interface VolumeMeasureLabelsType {
    start?: boolean;
    sides?: boolean;
    height?: boolean,
    area?: boolean;
    volume?: boolean;
}

const VolumeMeasureLabelsDefault: VolumeMeasureLabelsType = {
    start: false,
    sides: true,
    height: true,
    area: true,
    volume: true
}

export interface VolumeMeasurementOptions {
    units?: ENUM_DISTANCE_UNIT; // default meters
    labels?: VolumeMeasureLabelsType;
    prompt?: string;
    box?: OrientedBox;
}

export class VolumeMeasureController extends Controller {
    private readonly _eventedSupport: EventedSupport = new EventedSupport([VOLUME_MEASUREMENT_UPDATE, VOLUME_MEASUREMENT_READY, VOLUME_MEASUREMENT_END])

    private _shiftPressed: boolean = false;
    private _state: CreationState = CreationState.IDLE;
    private _firstCorner: Point | null = null;
    private _orientation: Vector3 | null = null;
    private _orientationComplement: Vector3 | null = null;
    private _width: number = 0;
    private _depth: number = 0;
    private _height: number = 0;
    private _uom: ENUM_DISTANCE_UNIT;
    private boxIsHovered: boolean;

    private emptyVolumes: number[][] = [];
    private abort: boolean;
    private success: boolean;
    private mapState: unknown;
    private refinedVolumeCalculation: number;
    private hoveredFace: Polygon | null = null;
    private resizedFaceIndex: number = -1;
    private resizedFace: Polygon | null = null;
    private _geoHandleSupport: GeolocateHandleSupport | null = null;
    private _lastRotation: number = 0;
    private _rotating: boolean = false;
    private _showLabels: VolumeMeasureLabelsType;
    private _prompt: string;
    private handleIsHovered: boolean = false;


    constructor(options?: VolumeMeasurementOptions) {
        super();
        this._uom = options?.units ?? ENUM_DISTANCE_UNIT.KM;
        this._prompt = options?.prompt !== undefined ? options.prompt : "Click to start";
        this._showLabels = options?.labels !== undefined ? options.labels : VolumeMeasureLabelsDefault;
        this.boxIsHovered = false;
        this.abort = false;
        this.success = false;
        this.refinedVolumeCalculation = 0;
        if (options && options.box) {
            this.initializeBox(options.box);
        }
    }

    invalidate() {
        super.invalidate();
    }

    public setUnits(units: ENUM_DISTANCE_UNIT) {
        this._uom = units;
        this.invalidate();
        this.emitMeasurementUpdate();
    }

    private getUnitObject() {
        return DistanceUnit[this._uom];
    }

    private getFactor() {
        return 1 / this.getUnitObject().toMetreFactor;
    }

    onActivate(map: Map) {
        if (!map.reference.equals(getReference("EPSG:4978"))) {
            throw new Error("Oriented boxes can only be created in a 3D reference");
        }
        super.onActivate(map);
    }

    onDeactivate(map: Map): Promise<void> | void {
        this.emptyVolumes = [];
        this._geoHandleSupport?.resetHandles();
        this._geoHandleSupport = null;
        return super.onDeactivate(map);
    }

    onKeyEvent(keyEvent: KeyEvent): HandleEventResult {
        if (keyEvent.domEvent instanceof KeyboardEvent) {
            const shiftWasPressed = this._shiftPressed;
            this._shiftPressed = keyEvent.domEvent.getModifierState("Shift");
            if (shiftWasPressed !== this._shiftPressed) {
                this.invalidate();
            }
        }
        return super.onKeyEvent(keyEvent);
    }

    onGestureEvent(event: GestureEvent): HandleEventResult {
        if (!this.map) {
            return HandleEventResult.EVENT_IGNORED;
        }
        if (this._state === CreationState.RESIZE_ROTATE && this._geoHandleSupport !== null) {
            if (event.type === GestureEventType.DRAG_END && this._rotating) {
                // Rotation flags clear
                this._rotating = false;
            }
            const plane = this.createPlane();
            const result = this._geoHandleSupport.handleGestureEvent(this.map, event, plane.focusPoint as Point);
            if (result === EVENT_HANDLED) return result;
            return this.shouldEndMoveRotate(event);
        }
        this._shiftPressed = event.modifier === ModifierType.SHIFT;
        if (event.type === GestureEventType.DRAG) {
            return this.handleDrag(event);
        } else if (event.type === GestureEventType.MOVE) {
            return this.handleMove(event);
        } else if (event.type === GestureEventType.SINGLE_CLICK_UP && (event.domEvent as MouseEvent).button === 0) {
            this.handleClick(event);
        } else if (event.type === GestureEventType.DOUBLE_CLICK) {
            return EVENT_HANDLED;
        } else if (event.type === GestureEventType.DOWN && (event.domEvent as MouseEvent).button === 0) {
            return this.handleButtonDown(event);
        } else if (event.type === GestureEventType.UP && (event.domEvent as MouseEvent).button === 0) {
            return this.handleButtonUp(event);
        }
        return EVENT_IGNORED;
    }

    private handleDrag(event: GestureEvent) {
        if (this._state === CreationState.FACE_RESIZING) {
            return this.updateFaceSize(event.viewPoint);
        }
        return EVENT_IGNORED;
    }

    private handleMove(event: GestureEvent) {
        if (this._state === CreationState.IDLE) {
            this.updateCorner(event.viewPoint);
        } else if (this._state === CreationState.CORNER_DEFINED) {
            this.updateWidth(event.viewPoint);
        } else if (this._state === CreationState.WIDTH_DEFINED) {
            this.updatePlane(event.viewPoint);
        } else if (this._state === CreationState.PLANE_DEFINED) {
            this.updateHeight(event.viewPoint);
        } else if (this._state === CreationState.VOLUME_DEFINED) {
            this.hoverDetect(event);
        }
        this.invalidate();
        return EVENT_HANDLED
    }

    private updateCorner(viewPoint: Point) {
        try {
            this._firstCorner = this.map!.getViewToMapTransformation(LocationMode.CLOSEST_SURFACE).transform(viewPoint);
        } catch (e) {
            if (!(e instanceof OutOfBoundsError)) {
                throw e;
            }
        }
    }

    private updateWidth(viewPoint: Point) {
        if (!this.map || !this._firstCorner) {
            throw new Error("Illegal state");
        }
        const worldPoint = rayPlaneIntersection(this.map.camera.eye,
            calculatePointingDirection(this.map, viewPoint), this._firstCorner, this._firstCorner);
        if (worldPoint) {
            this._width = Math.min(MAX_SIZE, Math.abs(distance(this._firstCorner, worldPoint)));
            this._orientation = normalize(sub(worldPoint, this._firstCorner));
            this._orientationComplement = normalize(cross(this._orientation, this._firstCorner));
            this.emitMeasurementUpdate();
        }
    }

    private updatePlane(viewPoint: Point) {
        if (!this.map || !this._firstCorner || !this._orientation || !this._orientationComplement) {
            throw new Error("Illegal state");
        }
        const worldPoint = rayPlaneIntersection(this.map.camera.eye,
            calculatePointingDirection(this.map, viewPoint), this._firstCorner, this._firstCorner)
        if (worldPoint) {
            this._depth = clamp(
                distanceAlongDirection(worldPoint, this._firstCorner, this._orientationComplement), -MAX_SIZE, MAX_SIZE);
            this.emitMeasurementUpdate();
        }
    }

    private updateHeight(viewPoint: Point) {
        if (!this.map || !this._firstCorner || !this._orientation || !this._orientationComplement) {
            throw new Error("Illegal state");
        }
        const right = cross(this.map.camera.forward, this.map.camera.up);
        const normal = normalize(cross(right, this._firstCorner));
        const thirdCorner = add(this._firstCorner,
            add(scale(this._orientation, this._width), scale(this._orientationComplement, this._depth)));

        const worldPoint = rayPlaneIntersection(this.map.camera.eye,
            calculatePointingDirection(this.map, viewPoint), normal, thirdCorner)
        if (worldPoint) {
            this._height = clamp(
                distanceAlongDirection(worldPoint, this._firstCorner, this._firstCorner),
                0,   //  Restricts to minimum 0
                MAX_SIZE
            );
            this.emitMeasurementUpdate();
        }
    }

    private handleButtonDown(event: GestureEvent) {
        if (!this.map) return HandleEventResult.EVENT_IGNORED;
        if (this._state === CreationState.VOLUME_DEFINED) {
            const {rectangle, hovered, face} = this.isHovered(event.viewPoint);
            if (hovered && rectangle) {
                if (face >= 0) {
                    const point = this.map.mapToViewTransformation.transform(rectangle.focusPoint as Point);
                    const d = distance(point, event.viewPoint);
                    if (d < ResizeHandleIconSize) {
                        this.resizedFaceIndex = face;
                        this.resizedFace = rectangle;
                        this._state = CreationState.FACE_RESIZING;
                        // console.log("Start dragging!!! face:", this.resizedFaceIndex);
                        return HandleEventResult.EVENT_HANDLED
                    }
                }
            }
        }
        return HandleEventResult.EVENT_IGNORED;
    }

    private handleButtonUp(_event: GestureEvent) {
        if (this._state === CreationState.FACE_RESIZING) {
            this._state = CreationState.VOLUME_DEFINED;
            this.resizedFaceIndex = -1;
            this.resizedFace = null;
            this.invalidate();
            this.emitMeasurementUpdate();
            return HandleEventResult.EVENT_HANDLED;
        }
        return HandleEventResult.EVENT_IGNORED;
    }

    private dimensionsChanged() {
        this.emptyVolumes = [];
        if (this._geoHandleSupport && this.map) {
            if (this._firstCorner && this._width && this._depth && this._height) {
                const plane = this.createPlane();
                this._geoHandleSupport.updateHandles(this.map, plane.focusPoint as Point, Math.abs(this._width), Math.abs(this._depth));
                this.invalidate();
            }
        }
    }

    private handleClick(event: GestureEvent) {
        if (this._state === CreationState.IDLE && this._firstCorner) {
            this._state = CreationState.CORNER_DEFINED;
        } else if (this._state === CreationState.CORNER_DEFINED && this._width && this._orientation) {
            this._state = CreationState.WIDTH_DEFINED;
            const eventObject = this.createEvent();
            this._eventedSupport.emit(VOLUME_MEASUREMENT_UPDATE, eventObject);
        } else if (this._state === CreationState.WIDTH_DEFINED && this._depth) {
            this._state = CreationState.PLANE_DEFINED;
            const eventObject = this.createEvent();
            this._eventedSupport.emit(VOLUME_MEASUREMENT_UPDATE, eventObject);
        } else if (this._state === CreationState.PLANE_DEFINED && this._height) {
            this.standardizePlane();
            this._state = CreationState.VOLUME_DEFINED;
            this.emitMeasurementUpdate();
            this._eventedSupport.emit(VOLUME_MEASUREMENT_READY, this.createEvent(true));
        } else if (this._state === CreationState.VOLUME_DEFINED) {
            return this.moveRotateOrRestart(event);
        } else {
            return HandleEventResult.EVENT_IGNORED;
        }
        return HandleEventResult.EVENT_HANDLED
    }

    private createEvent(withBox: boolean = false): VolumeMeasurementEvent | VolumeMeasurementCompleteEvent {
        const {width, height, depth, area, volume, refinedVolume} = this.calculateVolume();
        const labels = this.provideLabels();
        if (!withBox) {
            return {
                width,
                height,
                depth,
                area,
                volume,
                units: this._uom,
                factor: this.getFactor(),
                widthAsText: labels.width,
                heightAsText: labels.height,
                depthAsText: labels.depth,
                areaAsText: labels.area,
                volumeAsText: labels.volume,
                canRefine: this.canRefine(),
                refinedVolume,
                refinedVolumeText: labels.refined,
            }
        } else {
            return {
                width,
                height,
                depth,
                area,
                volume,
                units: this._uom,
                factor: this.getFactor(),
                widthAsText: labels.width,
                heightAsText: labels.height,
                depthAsText: labels.depth,
                areaAsText: labels.area,
                volumeAsText: labels.volume,
                canRefine: this.canRefine(),
                refinedVolume,
                refinedVolumeText: labels.refined,
                box: this.createBox(),
            }
        }
    }

    private calculateVolume() {
        const width = Math.abs(this._width);
        const height = Math.abs(this._height);
        const depth = Math.abs(this._depth);
        const area = width * depth;
        const volume = area * height;
        const refinedVolume = this.refinedVolumeCalculation;
        return {
            width,
            depth,
            height,
            area,
            volume,
            refinedVolume
        }
    }

    onDraw(geoCanvas: GeoCanvas) {
        if (this._state === CreationState.IDLE && this._firstCorner) {
            geoCanvas.drawIcon(this._firstCorner, VolumeMeasureStyles.POINT_STYLE);
            geoCanvas.drawIcon(this._firstCorner, VolumeMeasureStyles.POINT_STYLE_HIDDEN);
        }
        if (this._state === CreationState.CORNER_DEFINED) {
            const line = this.createLineWidth();
            geoCanvas.drawIcon(line.getPoint(0), VolumeMeasureStyles.POINT_STYLE);
            geoCanvas.drawIcon(line.getPoint(0), VolumeMeasureStyles.POINT_STYLE_HIDDEN);
            geoCanvas.drawIcon(line.getPoint(1), VolumeMeasureStyles.POINT_STYLE);
            geoCanvas.drawIcon(line.getPoint(1), VolumeMeasureStyles.POINT_STYLE_HIDDEN);
            geoCanvas.drawShape(line, VolumeMeasureStyles.LINE_STYLE)
            geoCanvas.drawShape(line, VolumeMeasureStyles.LINE_STYLE_HIDDEN)
        } else if (this._state === CreationState.WIDTH_DEFINED) {
            const plane = this.createPlane();
            geoCanvas.drawIcon(plane.getPoint(0), VolumeMeasureStyles.POINT_STYLE);
            geoCanvas.drawIcon(plane.getPoint(0), VolumeMeasureStyles.POINT_STYLE_HIDDEN);
            geoCanvas.drawIcon(plane.getPoint(1), VolumeMeasureStyles.POINT_STYLE);
            geoCanvas.drawIcon(plane.getPoint(1), VolumeMeasureStyles.POINT_STYLE_HIDDEN);
            geoCanvas.drawIcon(plane.getPoint(2), VolumeMeasureStyles.POINT_STYLE);
            geoCanvas.drawIcon(plane.getPoint(2), VolumeMeasureStyles.POINT_STYLE_HIDDEN);
            geoCanvas.drawShape(plane, VolumeMeasureStyles.PLANE_STYLE);
            geoCanvas.drawShape(plane, VolumeMeasureStyles.PLANE_STYLE_HIDDEN);
        } else if (this._state === CreationState.PLANE_DEFINED ||
            this._state === CreationState.VOLUME_DEFINED ||
            this._state === CreationState.FACE_RESIZING ||
            this._state === CreationState.RESIZE_ROTATE
        ) {
            drawBox(geoCanvas, this.createBox(), {
                withOccludedPart: true,
                //  hightlighted: this._state === CreationState.VOLUME_DEFINED && this.boxIsHovered
            });

            if (this.boxIsHovered && this.hoveredFace && this._state !== CreationState.RESIZE_ROTATE) {
                geoCanvas.drawShape(this.hoveredFace, {
                    stroke: {color: "rgb(216,121,164)", width: 2},
                    fill: {color: "rgba(216,121,164, 0.2)"}
                });
                drawHandleResize(geoCanvas, this.hoveredFace, this.handleIsHovered);
            }

            if (this._state !== CreationState.RESIZE_ROTATE) {
                paintRefinedVolume(this.map as WebGLMap, geoCanvas, this.createBox(),
                    this.emptyVolumes,
                    {width: this._width, height: this._height, depth: this._depth},
                    this._orientation as Vector3, RefinedGridSize
                );
            }
            if (this._state === CreationState.RESIZE_ROTATE) {
                this._geoHandleSupport?.drawHandles(geoCanvas);
            }
        }
    }

    private createLineWidth() {
        if (!this.map || !this._firstCorner || !this._orientation) {
            throw new Error("Can not create line when map, first corner or orientation is undefined");
        }

        const secondCorner = toPoint(this._firstCorner.reference,
            add(this._firstCorner, scale(this._orientation, this._width)))
        return createPolyline(this._firstCorner.reference, [this._firstCorner, secondCorner]);
    }

    private createPlane() {
        if (!this.map || !this._firstCorner || !this._orientation || !this._orientationComplement) {
            throw new Error("Can not create plane when map, first corner or orientation is undefined");
        }
        return createPolygon(this.map.reference, [
            this._firstCorner,
            toPoint(this.map.reference, add(this._firstCorner, scale(this._orientation, this._width))),
            toPoint(
                this.map.reference, add(this._firstCorner,
                    add(scale(this._orientation, this._width), scale(this._orientationComplement, this._depth)))),
            toPoint(this.map.reference, add(this._firstCorner, scale(this._orientationComplement, this._depth))),
        ])
    }

    private createBox() {
        return this.createBoxFromParameters({
            firstCorner: this._firstCorner,
            orientation: this._orientation,
            orientationComplement: this._orientationComplement,
            width: this._width,
            height: this._height,
            depth: this._depth,
        });
    }

    // Overloads
    on(
        event: typeof VOLUME_MEASUREMENT_UPDATE,
        callback: (evt: VolumeMeasurementEvent) => void,
        context?: any
    ): Handle;

    on(
        event: typeof VOLUME_MEASUREMENT_READY | typeof VOLUME_MEASUREMENT_END,
        callback: (evt: VolumeMeasurementCompleteEvent) => void,
        context?: any
    ): Handle;

    on(
        event: "Activated" | "Deactivated" | "Invalidated",
        callback: (...args: any[]) => void,
        context?: any
    ): Handle;

    on(event: "Activated" | "Deactivated" | "Invalidated" |
           typeof VOLUME_MEASUREMENT_READY | typeof VOLUME_MEASUREMENT_UPDATE | typeof VOLUME_MEASUREMENT_END,
       callback: (...args: any[]) => void, context?: any): Handle {
        if (event === VOLUME_MEASUREMENT_END) {
            return this._eventedSupport.on(event, callback, context);
        } else if (event === VOLUME_MEASUREMENT_READY) {
            return this._eventedSupport.on(event, callback, context);
        } else if (event === VOLUME_MEASUREMENT_UPDATE) {
            return this._eventedSupport.on(event, callback, context);
        } else if (event === "Activated") {
            return super.on(event, callback, context);
        } else if (event === "Deactivated") {
            return super.on(event, callback, context);
        }
        return super.on(event, callback, context);
    }


    private formatNumber(n: number): string {
        return this.getUnitObject().getDistanceText(n);
    }

    private formatNumberArea(n: number): string {
        return this.getUnitObject().getAreaText(n);
    }

    private formatNumberVolume(n: number): string {
        return this.getUnitObject().getVolumeText(n);
    }

    private provideLabels() {
        const v = this.calculateVolume();
        return {
            width: this.formatNumber(v.width),
            height: this.formatNumber(v.height),
            depth: this.formatNumber(v.depth),
            area: this.formatNumberArea(v.area),
            volume: this.formatNumberVolume(v.volume),
            refined: this.formatNumberVolume(v.refinedVolume),
        }
    }

    onDrawLabel(labelCanvas: LabelCanvas) {
        const htmlTag = (text: string) => {
            return `<div class="volume-measurement-label"><span>${text}</span></div>`
        }
        const htmlPrompt = (text: string) => {
            return `<div class="volume-measurement-prompt"><span>${text}</span></div>`
        }
        const drawSinglePointLabel = () => labelCanvas.drawLabel(htmlPrompt(this._prompt), this._firstCorner as Point, {});
        const drawLineLabels = () => {
            const lineWidth = this.createLineWidth();
            labelCanvas.drawLabelOnPath(htmlTag(label.width), lineWidth, {priority: 2});
        }
        const drawPlaneLabels = () => {
            const plane = this.createPlane();
            if (this._showLabels.sides) {
                drawLineLabels();
                const lineDepth = createPolyline(plane.reference, [plane.getPoint(1), plane.getPoint(2)]);
                labelCanvas.drawLabelOnPath(htmlTag(label.depth), lineDepth, {priority: 2});
            }
            if (this._showLabels.area) labelCanvas.drawLabelInPath(htmlTag(label.area), plane, {priority: 3});
        }
        const drawVolumeLabels = () => {
            if (!this.map) return;
            drawPlaneLabels();

            const box = this.createBox();
            const cornerPoints = box.getCornerPoints();

            if (this._showLabels.height) {
                const lineHeight = createPolyline(box.reference, [cornerPoints[5], cornerPoints[4]]);
                labelCanvas.drawLabelOnPath(htmlTag(label.height), lineHeight, {priority: 2});
            }

            const polygon = createPolygon(this.map.reference, [
                cornerPoints[0], cornerPoints[2], cornerPoints[6], cornerPoints[4]
            ])
            if (this._showLabels.volume) labelCanvas.drawLabelInPath(htmlTag(label.volume), polygon, {priority: 1});
        }

        const label = this.provideLabels()
        if (this._state === CreationState.IDLE && this._firstCorner) {
            if (this._showLabels.start) drawSinglePointLabel()
        }
        if (this._state === CreationState.CORNER_DEFINED) {
            if (this._showLabels.sides) drawLineLabels();
        } else if (this._state === CreationState.WIDTH_DEFINED) {
            drawPlaneLabels();
        } else if (this._state === CreationState.PLANE_DEFINED || this._state === CreationState.VOLUME_DEFINED) {
            drawVolumeLabels();
        } else if (this._state === CreationState.RESIZE_ROTATE) {
            this._geoHandleSupport?.drawHandleLabels(labelCanvas);
        }
    }

    private moveRotateOrRestart(event: GestureEvent) {
        if (!this.map) return EVENT_IGNORED;
        const {hovered} = this.isHovered(event.viewPoint);
        if (hovered && this.hoveredFace) {
            const point = this.map.mapToViewTransformation.transform(this.hoveredFace.focusPoint as Point);
            const d = distance(point, event.viewPoint);
            if (d < ResizeHandleIconSize) {
                return EVENT_IGNORED
            } else {
                // console.log("Trigger move/rotate!!");
                this._geoHandleSupport = new GeolocateHandleSupport();
                this.dimensionsChanged();
                this._geoHandleSupport.on(STYLE_UPDATED_EVENT, () => this.applyGeoHandleStyle());
                this._geoHandleSupport.on(ROTATED_EVENT, (rotation) => this.applyRotation(rotation));
                this._geoHandleSupport.on(MOVED_EVENT, (translation) => this.applyTranslation(translation));
                this._geoHandleSupport.on(ALTITUDE_CHANGED_EVENT, (translation) => this.applyTranslation(translation))
                this._state = CreationState.RESIZE_ROTATE;
                this.emitMeasurementUpdate();
                this.invalidate();
                return EVENT_IGNORED
            }
        } else {
            this._eventedSupport.emit(VOLUME_MEASUREMENT_END, this.createEvent(true));
            this._state = CreationState.IDLE;
            this._width = 0;
            this._depth = 0;
            this._height = 0;
            this.refinedVolumeCalculation = 0;
            this.emptyVolumes = [];
            this._firstCorner = null;
            this.invalidate();
            this.emitMeasurementUpdate();
            return EVENT_HANDLED
        }
    }

    private shouldEndMoveRotate(event: GestureEvent) {
        if (event.type === GestureEventType.SINGLE_CLICK_UP && (event.domEvent as MouseEvent).button === 0) {
            const {rectangle, hovered, face} = this.isHovered(event.viewPoint);
            if (hovered && face > -1) {
                this._state = CreationState.VOLUME_DEFINED;
                // console.log("Trigger move/rotate END!!");
                this._geoHandleSupport?.resetHandles();
                this._geoHandleSupport = null;
                this.resizedFaceIndex = face;
                this.hoveredFace = rectangle;

                //  Trigger Event to enable refine
                this.emitMeasurementUpdate();

                this.invalidate();
                return EVENT_HANDLED
            }
        }
        return EVENT_IGNORED
    }

    private hoverDetect(event: GestureEvent) {
        if (!this.map) return;
        const {rectangle, hovered} = this.isHovered(event.viewPoint);
        this.boxIsHovered = hovered;
        if (hovered && rectangle) {
            this.hoveredFace = rectangle;
            const point = this.map.mapToViewTransformation.transform(rectangle.focusPoint as Point);
            const d = distance(point, event.viewPoint);
            this.handleIsHovered = d < ResizeHandleIconSize;
        } else {
            this.hoveredFace = null;
            this.handleIsHovered = false;
        }
    }

    private isHovered(viewPoint: Vector3): { rectangle: Polygon | null; hovered: boolean, face: number } {
        if (!this.map) {
            return {rectangle: null, hovered: false, face: 0};
        }

        const eye = (this.map.camera as PerspectiveCamera).eye;
        const pointingDirection = calculatePointingDirection(this.map, viewPoint);
        let minDistance = Number.MAX_SAFE_INTEGER;
        let hoveredRectangle: Polygon | null = null;

        const box = this.createBox();
        let faceCount = 0;
        let face = -1;
        for (const rectangle of createFacePolygons(box)) {
            const intersectionPoint = rayRectangleIntersection(eye, pointingDirection, rectangle);
            if (intersectionPoint) {
                const intersectionDistance = distance(intersectionPoint, eye);
                if (intersectionDistance < minDistance) {
                    minDistance = intersectionDistance;
                    hoveredRectangle = rectangle;
                    face = faceCount;
                }
            }
            faceCount++;
        }

        return {rectangle: hoveredRectangle, hovered: hoveredRectangle !== null, face};
    }


    private async moveCameraToPointAndSample(point: Point, maxValue: number) {
        if (!this.map) return 0;
        await setCameraLocation(this.map, point);
        const viewPoint = createPoint(null, [this.map.domNode.clientWidth / 2, this.map.domNode.clientHeight / 2]);
        try {
            const mapPoint = this.map.getViewToMapTransformation(LocationMode.CLOSEST_SURFACE).transform(viewPoint);
            const d = distance(point, mapPoint);
            return d > maxValue ? maxValue : d;
        } catch (_e) {
            return 0;
        }
    }

    private substractEmptyAreas() {
        const width = Math.abs(this._width);
        const depth = Math.abs(this._depth);
        const height = Math.abs(this._height);
        const area = width * depth;
        const volume = area * height;

        if (this.canRefine() && this.emptyVolumes.length > 0) {
            const w = width / RefinedGridSize;
            const d = depth / RefinedGridSize;
            const smallBaseArea = w * d;
            let emptyVolume = 0;
            for (let i = 0; i < RefinedGridSize; i++) {
                for (let j = 0; j < RefinedGridSize; j++) {
                    emptyVolume += smallBaseArea * this.emptyVolumes[i][j];
                }
            }
            const refined = volume - emptyVolume;
            return refined > 0 ? refined : 0;
        } else {
            return volume;
        }
    }

    private canRefine() {
        return this._state === CreationState.VOLUME_DEFINED;
    }

    public refineCalculation(labels: { text: string, buttonText: string }) {
        if (!this.canRefine()) return;
        this.emptyVolumes = [];

        const box = this.createBox();
        const cornerPoints = box.getCornerPoints(); // 0..7

        // Top face corners
        const top0 = cornerPoints[0]; // top-left
        const top4 = cornerPoints[4]; // bottom-left
        const top2 = cornerPoints[2]; // top-right
        const top6 = cornerPoints[6]; // bottom-right

        // const GEODESY = createEllipsoidalGeodesy(box.reference);
        const GEODESY = createCartesianGeodesy(box.reference as CoordinateReference);

        const halfStep = 0.5 / RefinedGridSize; // precompute shift
        const step = 1 / RefinedGridSize;

        const gridPoints: typeof top0[][] = new Array(RefinedGridSize);

        for (let i = 0; i < RefinedGridSize; i++) {
            const t = step * i + halfStep;

            // Interpolate vertical edges once per row
            const leftPoint = GEODESY.interpolate(top0, top4, t);
            const rightPoint = GEODESY.interpolate(top2, top6, t);

            const row: typeof leftPoint[] = new Array(RefinedGridSize);

            for (let j = 0; j < RefinedGridSize; j++) {
                const s = step * j + halfStep;
                row[j] = GEODESY.interpolate(leftPoint, rightPoint, s);
            }
            gridPoints[i] = row;
        }

        this.abort = false;
        this.refinedVolumeCalculation = 0;
        this.success = false;
        this.saveScreen();
        showBlockingBanner({
            text: labels.text,
            buttonText: labels.buttonText,
            onAbort: () => {
                this.abort = true;
                console.warn("User aborted volume measurement");
            },
            progress: 0
        });

        const maxDistance = distance(cornerPoints[0], cornerPoints[1]);
        this.processGridPoints(gridPoints, maxDistance).then((data) => {
            if (this.success) {
                this.emptyVolumes = data;
                this.refinedVolumeCalculation = this.substractEmptyAreas();
                this.invalidate();
                this.emitMeasurementUpdate();
            } else {
                this.emptyVolumes = [];
            }
            this.restoreScreen()?.finally(hideBlockingBanner);
        });
    }

    private emitMeasurementUpdate() {
        this._eventedSupport.emit(VOLUME_MEASUREMENT_UPDATE, this.createEvent());
    }

    private saveScreen() {
        this.mapState = this.map?.saveState();
    }

    private restoreScreen() {
        return this.map?.restoreState(this.mapState);
    }

    private async processGridPoints(gridPoints: Point[][], maxValue: number) {
        const data: number[][] = [];

        for (let i = 0; i < gridPoints.length; i++) {
            if (this.abort) return [];
            const row = gridPoints[i];
            const dataRow: number[] = [];

            // Determine actual scan order for the row
            const leftToRight = i % 2 === 0;

            if (leftToRight) {
                for (let j = 0; j < row.length; j++) {
                    if (this.abort) break;
                    const point = row[j];
                    const distance = await this.moveCameraToPointAndSample(point, maxValue);
                    dataRow.push(distance);
                }
            } else {
                if (this.abort) return [];
                for (let j = row.length - 1; j >= 0; j--) {
                    const point = row[j];
                    const distance = await this.moveCameraToPointAndSample(point, maxValue);
                    dataRow.unshift(distance); // maintain original left→right order in data
                }
            }
            data.push(dataRow);
            updateBlockingBannerProgress(100 * (i + 1) / RefinedGridSize);
        }
        this.success = true;
        return data;
    }

    //  FRom CHAT GPT:
    private updateFaceSize(viewPoint: Point) {
        if (!this.map || this.resizedFaceIndex <= -1) {
            return HandleEventResult.EVENT_IGNORED;
        }

        // Recreate box and face polygons (fresh geometry)
        const box = this.createBox();
        const polygons = createFacePolygons(box);

        // Guard: index must be in range
        if (this.resizedFaceIndex < 0 || this.resizedFaceIndex >= polygons.length) {
            this.resizedFace = null;
            this.hoveredFace = null;
            return HandleEventResult.EVENT_IGNORED;
        }

        // Refresh reference to the face polygon we're dragging and keep hoveredFace synced
        this.resizedFace = polygons[this.resizedFaceIndex];
        this.hoveredFace = this.resizedFace;

        if (this._depth < 0) {
            switch (this.resizedFaceIndex) {
                case 0: // X- (left)
                    return this.updateWidthFromFaceDragPrimary(viewPoint, polygons[1].focusPoint as Point);
                case 1: // X+ (right)
                    return this.updateWidthFromFaceDragSecondary(viewPoint, polygons[0].focusPoint as Point);
                case 2: // Y- (front)
                    return this.updateDepthFromFaceDragPrimary(viewPoint, polygons[3].focusPoint as Point, 1);
                case 3: // Y+ (back)
                    return this.updateDepthFromFaceDragSecondary(viewPoint, polygons[2].focusPoint as Point, 1);
                case 5: // Z- (bottom)
                    return this.updateHeightFromTopFaceDrag(viewPoint, polygons[4].focusPoint as Point);
                default:
                    return HandleEventResult.EVENT_IGNORED;
            }
        } else {
            switch (this.resizedFaceIndex) {
                case 0: // X- (left)
                    return this.updateDepthFromFaceDragPrimary(viewPoint, polygons[1].focusPoint as Point, -1);
                case 1: // X+ (right)
                    return this.updateDepthFromFaceDragSecondary(viewPoint, polygons[0].focusPoint as Point, -1);
                case 2: // Y- (front)
                    return this.updateWidthFromFaceDragPrimary(viewPoint, polygons[3].focusPoint as Point);
                case 3: // Y+ (back)
                    return this.updateWidthFromFaceDragSecondary(viewPoint, polygons[2].focusPoint as Point);
                case 5: // Z- (bottom)
                    return this.updateHeightFromTopFaceDrag(viewPoint, polygons[4].focusPoint as Point);
                default:
                    return HandleEventResult.EVENT_IGNORED;
            }
        }
    }

    // Success!!!!
    private updateHeightFromTopFaceDrag(viewPoint: Point, thirdCorner: Point) {
        if (!this.map || !this._firstCorner || !this._orientation || !this._orientationComplement) {
            throw new Error("Illegal state");
        }
        const right = cross(this.map.camera.forward, this.map.camera.up);
        const normal = normalize(cross(right, this._firstCorner));

        const worldPoint = rayPlaneIntersection(this.map.camera.eye,
            calculatePointingDirection(this.map, viewPoint), normal, thirdCorner);
        if (worldPoint) {
            this._height = clamp(
                distanceAlongDirection(worldPoint, this._firstCorner, this._firstCorner),
                0,   //  Restricts to minimum 0
                MAX_SIZE
            );
            this.invalidate();
            this.emitMeasurementUpdate();
        }
        return HandleEventResult.EVENT_HANDLED;
    }

    // Success!!!!
    private updateWidthFromFaceDragPrimary(viewPoint: Point, oppositeFaceCenter: Point) {
        if (!this.map || !this._firstCorner || !this._orientation) {
            return HandleEventResult.EVENT_IGNORED;
        }

        // Ray-plane intersection
        const worldPoint = rayPlaneIntersection(this.map.camera.eye,
            calculatePointingDirection(this.map, viewPoint), oppositeFaceCenter, oppositeFaceCenter);

        if (worldPoint) {
            const newWidth = clamp(distanceAlongDirection(oppositeFaceCenter, worldPoint, this._orientation), 0.01, MAX_SIZE);
            // Move _firstCorner along _orientation so the far face (oppositeFace) remains fixed
            const delta = this._width - newWidth;
            this._firstCorner = toPoint(this._firstCorner.reference, add(this._firstCorner, scale(this._orientation, delta)));

            // Update internal width
            this._width = newWidth;
            this.dimensionsChanged();
            this.invalidate();
            this.emitMeasurementUpdate();
        }
        return HandleEventResult.EVENT_HANDLED;
    }

    // Success!!!!
    private updateWidthFromFaceDragSecondary(viewPoint: Point, oppositeFaceCenter: Point) {
        if (!this.map || !this._firstCorner || !this._orientation) {
            return HandleEventResult.EVENT_IGNORED;
        }
        // Ray-plane intersection
        const worldPoint = rayPlaneIntersection(this.map.camera.eye,
            calculatePointingDirection(this.map, viewPoint), oppositeFaceCenter, oppositeFaceCenter);

        if (worldPoint) {
            this._width = clamp(distanceAlongDirection(worldPoint, oppositeFaceCenter, this._orientation), 0.01, MAX_SIZE);
            this.dimensionsChanged();
            this.invalidate();
            this.emitMeasurementUpdate();
        }

        return HandleEventResult.EVENT_HANDLED;
    }

    /// Done!
    private updateDepthFromFaceDragPrimary(viewPoint: Point, oppositeFaceCenter: Point, direction: 1 | -1) {
        if (!this.map || !this._firstCorner || !this._orientation) {
            return HandleEventResult.EVENT_IGNORED;
        }

        const MINMAX = direction === 1 ? {min: -MAX_SIZE, max: -0.01} : {min: 0.01, max: MAX_SIZE}

        const worldPoint = rayPlaneIntersection(this.map.camera.eye,
            calculatePointingDirection(this.map, viewPoint), oppositeFaceCenter, oppositeFaceCenter)
        if (worldPoint) {
            const newDepth = clamp(distanceAlongDirection(oppositeFaceCenter, worldPoint, this._orientationComplement as Vector3), MINMAX.min, MINMAX.max);
            const delta = this._depth - newDepth;
            this._firstCorner = toPoint(this._firstCorner.reference, add(this._firstCorner, scale(this._orientationComplement as Vector3, delta)));
            this._depth = newDepth;
            this.dimensionsChanged();
            this.invalidate();
            this.emitMeasurementUpdate();
        }

        return HandleEventResult.EVENT_HANDLED;
    }

    // Success!!!!
    private updateDepthFromFaceDragSecondary(viewPoint: Point, oppositeFaceCenter: Point, direction: 1 | -1) {
        if (!this.map || !this._firstCorner || !this._orientation) {
            return HandleEventResult.EVENT_IGNORED;
        }

        const MINMAX = direction === 1 ? {min: -MAX_SIZE, max: -0.01} : {min: 0.01, max: MAX_SIZE}

        const worldPoint = rayPlaneIntersection(this.map.camera.eye,
            calculatePointingDirection(this.map, viewPoint), oppositeFaceCenter, oppositeFaceCenter)
        if (worldPoint) {
            this._depth = clamp(distanceAlongDirection(worldPoint, oppositeFaceCenter, this._orientationComplement as Vector3), MINMAX.min, MINMAX.max);
            this.dimensionsChanged();
            this.invalidate();
            this.emitMeasurementUpdate();
        }

        return HandleEventResult.EVENT_HANDLED;
    }


    // Successfully implemented
    private applyRotation = (absoluteRotation: number) => {
        if (!this._orientation || !this._orientationComplement || !this._firstCorner) {
            console.warn("Cannot apply rotation: missing data");
            return;
        }

        // rotation start
        if (!this._rotating) {
            // Rotation started flags
            this._rotating = true;
            this._lastRotation = 0;
        }

        // incremental delta
        const delta = this._lastRotation - absoluteRotation; // swap if direction is wrong

        // center of the plane
        const plane = this.createPlane();
        const corners = [plane.getPoint(0), plane.getPoint(1), plane.getPoint(2), plane.getPoint(3)];
        const center = scale(addArray(corners), 1 / corners.length);

        const planeNormal = cross(this._orientation, this._orientationComplement);

        // rotate orientation vectors incrementally
        this._orientation = rotateAroundAxis(this._orientation, planeNormal, -delta);
        this._orientationComplement = rotateAroundAxis(this._orientationComplement, planeNormal, -delta);

        // rotate first corner incrementally
        const point = rotatePointAroundLine(this._firstCorner, center, planeNormal, -delta);
        this._firstCorner = toPoint(this._firstCorner.reference, point);

        this._lastRotation = absoluteRotation;
        this.invalidate();
    };

    // Successfully implemented!!!
    private applyGeoHandleStyle = () => {
        this.invalidate();
    }

    // Successfully implemented!!!
    private applyTranslation = (translation: Vector3) => {
        if (!this._orientation || !this._orientationComplement || !this._firstCorner) {
            console.warn("Cannot apply translation: missing data");
            return;
        }
        // Update the first corner by adding the translation vector
        this._firstCorner = toPoint(
            this._firstCorner.reference,
            {
                x: this._firstCorner.x + translation.x,
                y: this._firstCorner.y + translation.y,
                z: this._firstCorner.z + translation.z,
            }
        );

        // If you have orientation vectors for the box, the whole box moves with this first corner
        // No need to modify _orientation or _orientationComplement for pure translation

        // Update handles so they stay on the box
        const plane = this.createPlane();
        this._geoHandleSupport?.updateHandles(this.map!, plane.focusPoint as Point, Math.abs(this._width), Math.abs(this._depth));

        this.invalidate();
    }


    private initializeBox(box: OrientedBox) {
        const inputs = this.extractBoxParameters(box);
        this._firstCorner = inputs.firstCorner;
        this._orientation = inputs.orientation;
        this._orientationComplement = inputs.orientationComplement;
        this._width = inputs.width;
        this._depth = inputs.depth;
        this._height = inputs.height;
        this._state = CreationState.VOLUME_DEFINED;
    }


    // OK!
    private extractBoxParameters(box: OrientedBox) {
        const c = box.getCornerPoints(); // 0..7
        const firstCorner = c[7]; // bottom corner reference

        // Vectors from first corner
        const widthVec = sub(c[5], firstCorner);  // 7 → 3
        const depthVec = sub(c[3], firstCorner);  // 7 → 5
        const heightVec = sub(c[6], firstCorner); // vertical

        const orientation = normalize(sub(c[5], firstCorner));
        const orientationComplement = normalize(cross(orientation, firstCorner));

        return {
            firstCorner,
            width: Math.abs(length(widthVec)),
            depth: Math.abs(length(depthVec)),
            height: length(heightVec),
            orientation,
            orientationComplement
        };
    }


    private createBoxFromParameters(params: {
        firstCorner: Point,
        width: number,
        depth: number,
        height: number,
        orientation: Vector3,
        orientationComplement: Vector3
    }) {
        if (!this.map || !params.firstCorner || !params.orientation || !params.orientationComplement) {
            throw new Error("Cannot create box when map, first corner, or orientations are undefined");
        }

        const northFacingCamera = (this.map.camera as PerspectiveCamera).lookFrom({
            eye: params.firstCorner,
            yaw: 0,
            pitch: 0,
            roll: 0
        });

        // Compute azimuth from firstCorner to width orientation
        let azimuth = -angle(northFacingCamera.forward, params.orientation, northFacingCamera.up) - 90;

        // Swap axes if depth is positive (matches signed handling)
        if (params.depth > 0) {
            azimuth += 90;
        }

        return createOrientedBox(
            createTransformationFromGeoLocation(params.firstCorner, {azimuth}),
            {
                x: 0,
                y: 0,
                z: (params.height < 0 || this._shiftPressed) ? -Math.abs(params.height) : 0
            },
            {
                x: params.depth < 0 ? params.width : Math.abs(params.depth),
                y: params.depth < 0 ? Math.abs(params.depth) : params.width,
                z: Math.abs(this._shiftPressed ? params.height * 2 : params.height)
            }
        );
    }

    // OK!
    private standardizePlane() {
        if (this._depth < 0) {
            console.log("Standardization required!");
            console.log("Width: ", this._width);
            console.log("Depth:", this._depth);
            // Calculate the fourth corner (opposite along depth)
            // Move the first corner to the fourth corner
            const fourthCorner = toPoint(
                this.map.reference,
                add(this._firstCorner, scale(this._orientationComplement, this._depth))
            );

            const worldPoint = toPoint(
                this.map.reference,
                add(
                    this._firstCorner,
                    add(
                        scale(this._orientation, this._width),
                        scale(this._orientationComplement, this._depth)
                    )
                )
            );

            this._firstCorner =  fourthCorner;

            // Make depth positive
            this._depth = Math.abs(this._depth);

            this._orientation = normalize(sub(worldPoint, this._firstCorner));
            this._orientationComplement = normalize(cross(this._orientation, this._firstCorner));
        }
    }

}
