# Volume Measurement Tool

This library provides a controller for measuring volumes on LuciadRIA maps.

## Installation

```bash
npm install ria-volume-measurement-tool

```
## Usage

```typescript
import { VolumeMeasureController } from 'ria-volume-measurement-tool';

const controller = new VolumeMeasureController();
```

## Options

- units: ENUM_DISTANCE_UNIT (default: meters)
- labels: { start?: boolean, sides?: boolean, height?: boolean, area?: boolean, volume?: boolean }
- prompt: string displayed to the user

```typescript
import { Map } from "@luciad/ria/view/Map.js";
import { VolumeMeasureController, VOLUME_MEASUREMENT_UPDATE } from "ria-volume-measurement-tool";
import { ENUM_DISTANCE_UNIT } from "ria-volume-measurement-tool/util/DistanceUnit.js";

// Create a controller instance
const controller = new VolumeMeasureController({
  units: ENUM_DISTANCE_UNIT.METERS,
  labels: {
    start: true,
    sides: true,
    height: true,
    area: true,
    volume: true
  },
  prompt: "Click four points to define the volume",
});

// Add controller to map
map.controller = controller;
```

## Events

- VOLUME_MEASUREMENT_UPDATE – emitted when volume measurements change
- VOLUME_MEASUREMENT_READY – emitted when the volume is fully defined
- VOLUME_MEASUREMENT_END – emitted when measurement is completed

```typescript
// Listen to measurement updates
controller.on(VOLUME_MEASUREMENT_UPDATE, (event) => {
  console.log("Volume updated:", event.width, event.depth, event.height, event.volume);
});

// Listen to measurement updates
controller.on(VOLUME_MEASUREMENT_END, (event) => {
    console.log("Volume updated:", event.width, event.depth, event.height, event.volume);
});
```

## Edit an existing OrientedBox
```typescript
const controller = new VolumeMeasureController({
    units: ENUM_DISTANCE_UNIT.METERS,
    labels: {
        start: true,
        sides: true,
        height: true,
        area: true,
        volume: true
    },
    box: AnOrientedBox 
});
```
