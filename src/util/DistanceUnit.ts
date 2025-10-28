class UnitObject {
    get uomName(): string {
        return this._uomName;
    }

    set uomName(value: string) {
        this._uomName = value;
    }
    private _uomName: string;
    private _uomSymbol: string;
    private _toMetreFactor: number;
    private smallerUnit: ENUM_DISTANCE_UNIT;
    private minimumMeter: number;

    constructor(uomName: string, uomSymbol: string, toMetreFactor: number, minimumMeter: number, smallerUnit: ENUM_DISTANCE_UNIT) {
        this._uomName = uomName;
        this._uomSymbol = uomSymbol;
        this._toMetreFactor = toMetreFactor;

        this.minimumMeter = minimumMeter;
        this.smallerUnit = smallerUnit
    }


    get uomSymbol(): string {
        return this._uomSymbol;
    }

    get toMetreFactor(): number {
        return this._toMetreFactor;
    }

    public convertToStandard(aValue: number) {
        return aValue * this._toMetreFactor;
    }

    public convertFromStandard(aValue: number) {
        return aValue / this._toMetreFactor;
    }

    public getDistanceText(meters:number): string {
        const minimum = this.minimumMeter;
        if (meters<minimum) {
            const smaller = DistanceUnit[this.smallerUnit];
            return smaller.getDistanceText(meters);
        } else {
            const value = meters / this._toMetreFactor;
            return "" + value.toFixed(3) + " " +this._uomSymbol;
        }
    }

    public getAreaText(squareMeters:number): string {
        const minimum = this.minimumMeter * this.minimumMeter;
        if (squareMeters<minimum) {
            const smaller = DistanceUnit[this.smallerUnit];
            return smaller.getAreaText(squareMeters);
        } else {
            const value = squareMeters / (this._toMetreFactor*this._toMetreFactor);
            return "" + value.toFixed(3) + " " +this._uomSymbol+ "\u00B2";
        }
    }

    public getVolumeText(cubicMeters: number): string {
        // Minimum volume threshold based on minimumMeter³
        const minimum = Math.pow(this.minimumMeter, 3);

        if (cubicMeters < minimum) {
            // fallback to smaller unit recursively
            const smaller = DistanceUnit[this.smallerUnit];
            return smaller.getVolumeText(cubicMeters);
        } else {
            const value = cubicMeters / Math.pow(this._toMetreFactor, 3);
            return value.toFixed(3) + " " + this._uomSymbol + "\u00B3"; // append cube symbol
        }
    }
}

// @ts-ignore
export enum ENUM_DISTANCE_UNIT {
    METRE = "METRE",
    KM = "KM",
    FT = "FT",
    MILE_US = "MILE_US",
    NM = "NM",
}

const DistanceUnit = {
    FT: new UnitObject("Feet", "ft", 0.30480060960121924, 0, ENUM_DISTANCE_UNIT.FT),
    KM: new UnitObject("Kilometre", "km", 1000, 1000, ENUM_DISTANCE_UNIT.METRE),
    METRE: new UnitObject("Metre", "m", 1, 0, ENUM_DISTANCE_UNIT.METRE),
    MILE_US: new UnitObject("MileUS", "mi", 1609.3472186944375, 305, ENUM_DISTANCE_UNIT.FT),
    NM: new UnitObject("NauticalMile", "NM", 1852.0, 305, ENUM_DISTANCE_UNIT.FT),
};

export default DistanceUnit;
