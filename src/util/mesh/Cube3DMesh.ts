export class Cube3DMesh {
    private readonly _height: number;
    private _zOffset: number;
    private readonly _radius: number;
    private readonly _sliceCount: number;
    private readonly _indices: number[];

    // Rotate the prism so the first face is "front"
    private static readonly PHI_OFFSET = Math.PI/4; // 45 degrees

    constructor(size: number) {
        this._zOffset = 0;
        this._height = size;
        this._radius = Math.SQRT2 / 2 * size; // circumscribed radius
        this._sliceCount = 4;
        this._indices = [];
    }

    get zOffset(): number {
        return this._zOffset;
    }

    set zOffset(value: number) {
        this._zOffset = value;
    }

    createVertices(): number[] {
        const vertices: number[] = [];
        const dphi = 2 * Math.PI / this._sliceCount;
        const baseZ = -0.5 * this._height + this.zOffset;
        const topZ = 0.5 * this._height + this.zOffset;
        let offset = 0;

        // Side surface
        for (let i = 0; i <= this._sliceCount; i++) {
            const phi = i * dphi + Cube3DMesh.PHI_OFFSET;
            const nx = Math.cos(phi);
            const ny = Math.sin(phi);
            const x0 = this._radius * nx;
            const y0 = this._radius * ny;
            const x1 = x0;
            const y1 = y0;
            // base vertex
            vertices.push(x0, y0, baseZ);
            this._indices.push(offset + 2 * i);
            // top vertex
            vertices.push(x1, y1, topZ);
            this._indices.push(offset + 2 * i + 1);
        }
        offset = this._indices.length;

        // Base surface (center + corner)
        for (let i = 0; i <= this._sliceCount; i++) {
            const phi = i * dphi + Cube3DMesh.PHI_OFFSET;
            const nx = Math.cos(phi);
            const ny = Math.sin(phi);
            const x0 = 0;
            const y0 = 0;
            const x1 = this._radius * nx;
            const y1 = this._radius * ny;
            vertices.push(x0, y0, baseZ); // center
            this._indices.push(offset + 2 * i);
            vertices.push(x1, y1, baseZ); // outer corner
            this._indices.push(offset + 2 * i + 1);
        }
        offset = this._indices.length;

        // Top surface (center + corner)
        for (let i = 0; i <= this._sliceCount; i++) {
            const phi = i * dphi + Cube3DMesh.PHI_OFFSET;
            const nx = Math.cos(phi);
            const ny = Math.sin(phi);
            const x0 = 0;
            const y0 = 0;
            const x1 = this._radius * nx;
            const y1 = this._radius * ny;
            vertices.push(x0, y0, topZ); // center
            this._indices.push(offset + 2 * i);
            vertices.push(x1, y1, topZ); // outer corner
            this._indices.push(offset + 2 * i + 1);
        }

        return vertices;
    }

    createIndices(): number[] {
        if (this._indices.length === 0) {
            this.createVertices();
        }

        const triangles: number[] = [];
        const numberOfSides = 3; // sides, base, top
        for (let i = 0; i < numberOfSides; i++) {
            const numberOfIndicesPerSide = this._indices.length / numberOfSides;
            for (let j = 1; j < numberOfIndicesPerSide - 1; j++) {
                triangles.push(
                    this._indices[j - 1 + i * numberOfIndicesPerSide],
                    this._indices[j + i * numberOfIndicesPerSide],
                    this._indices[j + 1 + i * numberOfIndicesPerSide]
                );
            }
        }

        return triangles;
    }

    createNormals(): number[] {
        const normals: number[] = [];
        const dphi = 2 * Math.PI / this._sliceCount;

        // Side normals
        for (let i = 0; i <= this._sliceCount; i++) {
            const phi = i * dphi + Cube3DMesh.PHI_OFFSET;
            const nx = Math.cos(phi);
            const ny = Math.sin(phi);
            // base vertex
            normals.push(nx, ny, 0);
            // top vertex
            normals.push(nx, ny, 0);
        }

        // Base normals (pointing down)
        for (let i = 0; i <= this._sliceCount; i++) {
            normals.push(0, 0, -1); // center
            normals.push(0, 0, -1); // outer
        }

        // Top normals (pointing up)
        for (let i = 0; i <= this._sliceCount; i++) {
            normals.push(0, 0, 1); // center
            normals.push(0, 0, 1); // outer
        }

        return normals;
    }

    createTextureCoordinates(): number[] {
        const texCoords: number[] = [];
        const dphi = 2 * Math.PI / this._sliceCount;

        // Side
        for (let i = 0; i <= this._sliceCount; i++) {
            const phi = i * dphi + Cube3DMesh.PHI_OFFSET;
            const tx = phi / (2 * Math.PI);
            texCoords.push(tx, 0); // base
            texCoords.push(tx, 1); // top
        }

        // Base
        for (let i = 0; i <= this._sliceCount; i++) {
            const phi = i * dphi + Cube3DMesh.PHI_OFFSET;
            const tx = phi / (2 * Math.PI);
            texCoords.push(tx, 0); // center
            texCoords.push(tx, 1); // outer
        }

        // Top
        for (let i = 0; i <= this._sliceCount; i++) {
            const phi = i * dphi + Cube3DMesh.PHI_OFFSET;
            const tx = phi / (2 * Math.PI);
            texCoords.push(tx, 0); // center
            texCoords.push(tx, 1); // outer
        }

        return texCoords;
    }
}
