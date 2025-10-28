import {Map} from "@luciad/ria/view/Map.js";
import {PerspectiveCamera} from "@luciad/ria/view/camera/PerspectiveCamera.js";
import {AnimationManager} from "@luciad/ria/view/animation/AnimationManager.js";
import {Point} from "@luciad/ria/shape/Point.js";
import {Move3DCameraAnimation} from "@luciad/ria-toolbox-controller/animation/Move3DCameraAnimation.js";

/**
 * Modifies the camera by setting both eye and LookFrom simultaneously.
 * Works only on maps with PerspectiveCamera.
 */
export function setCameraLocation(
    map: Map,
    point: Point,
) {
    const moveToAnimation = new Move3DCameraAnimation(
        map,
        point,
        0,
        -90,
        0,
        (map.camera as PerspectiveCamera).fovY,
        0,
    );
    return AnimationManager.putAnimation(map.cameraAnimationKey, moveToAnimation, false);
}

