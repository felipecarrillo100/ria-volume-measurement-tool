/*
 *
 * Copyright (c) 1999-2025 Luciad All Rights Reserved.
 *
 * Luciad grants you ("Licensee") a non-exclusive, royalty free, license to use,
 * modify and redistribute this software in source and binary code form,
 * provided that i) this copyright notice and license appear on all copies of
 * the software; and ii) Licensee does not utilize the software in a manner
 * which is disparaging to Luciad.
 *
 * This software is provided "AS IS," without a warranty of any kind. ALL
 * EXPRESS OR IMPLIED CONDITIONS, REPRESENTATIONS AND WARRANTIES, INCLUDING ANY
 * IMPLIED WARRANTY OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE OR
 * NON-INFRINGEMENT, ARE HEREBY EXCLUDED. LUCIAD AND ITS LICENSORS SHALL NOT BE
 * LIABLE FOR ANY DAMAGES SUFFERED BY LICENSEE AS A RESULT OF USING, MODIFYING
 * OR DISTRIBUTING THE SOFTWARE OR ITS DERIVATIVES. IN NO EVENT WILL LUCIAD OR ITS
 * LICENSORS BE LIABLE FOR ANY LOST REVENUE, PROFIT OR DATA, OR FOR DIRECT,
 * INDIRECT, SPECIAL, CONSEQUENTIAL, INCIDENTAL OR PUNITIVE DAMAGES, HOWEVER
 * CAUSED AND REGARDLESS OF THE THEORY OF LIABILITY, ARISING OUT OF THE USE OF
 * OR INABILITY TO USE SOFTWARE, EVEN IF LUCIAD HAS BEEN ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGES.
 */
import {create3DMesh} from "@luciad/ria/geometry/mesh/MeshFactory.js";
import type {Mesh} from "@luciad/ria/geometry/mesh/Mesh.js";
import {Cube3DMesh} from "./Cube3DMesh.js";


/**
 * Creates a 3D cube mesh.
 *
 * @param size the width of the cube
 * @param height the height of the cube
 * @param texture optional texture to apply to the cube
 */
export const create3DCube = (
    size: number,
    texture?: HTMLCanvasElement | HTMLImageElement | string
): Mesh => {
    const cube3DMesh = new Cube3DMesh(size);

    // Always include normals
    const meshOptions: {
        normals: number[];
        texCoords?: number[];
        image?: HTMLCanvasElement | HTMLImageElement | string
    } = {
        normals: cube3DMesh.createNormals()
    };

    // Only include texCoords if texture is provided
    if (texture) {
        meshOptions.texCoords = cube3DMesh.createTextureCoordinates();
        meshOptions.image = texture;
    }

    return create3DMesh(
        cube3DMesh.createVertices(),
        cube3DMesh.createIndices(),
        meshOptions
    );
};

