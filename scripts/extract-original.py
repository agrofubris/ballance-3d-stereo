#!/usr/bin/env python3
"""Convert user-supplied Ballance assets with the separately built MIT LibCmo/BMap reader.
No proprietary game data is part of this script. See docs/original-import.md.
"""
import argparse
import ctypes as C
import hashlib
import json
from pathlib import Path

U = C.c_uint32
P = C.c_void_p
F = C.c_float
CALLBACK = C.CFUNCTYPE(None, C.c_char_p)
class Matrix(C.Structure):
    _fields_ = [('values', F * 16)]
class Color(C.Structure):
    _fields_ = [('values', F * 4)]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--library', required=True)
    parser.add_argument('--game', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--entities', action='store_true', help='Convert shared gameplay models')
    parser.add_argument('--transformer', action='store_true', help='Convert the original transformer animation meshes')
    parser.add_argument('--menu', action='store_true', help='Convert the original menu scene and interface textures')
    parser.add_argument('--level', type=int, help='Convert one level; default converts all levels and shared balls')
    args = parser.parse_args()
    game, output = Path(args.game), Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    (output / 'textures').mkdir(exist_ok=True)
    temp = output / '.temp'; temp.mkdir(exist_ok=True)
    lib = C.CDLL(args.library)
    def function(name, types):
        fn = getattr(lib, name); fn.restype = C.c_bool; fn.argtypes = types; return fn
    init = function('BMInit', []); free = function('BMFile_Free', [P]); dispose = function('BMDispose', [])
    loader = function('BMFile_Load', [C.c_char_p, C.c_char_p, C.c_char_p, CALLBACK, U, C.POINTER(C.c_char_p), C.POINTER(P)])
    @CALLBACK
    def log(message):
        if message: print(message.decode('utf-8', 'replace'))
    assert init(), 'BMap initialization failed'
    entities = game / '3D Entities'
    if not entities.is_dir(): entities = game / '3D_Entities'
    files = [entities / 'Level' / f'Level_{args.level:02d}.NMO'] if args.level else sorted((entities / 'Level').glob('*.NMO')) + [entities / 'Balls.nmo']
    if args.entities: files = sorted((entities / 'PH').glob('*.nmo'))
    if args.transformer: files = [entities / 'AnimTrafo.nmo']
    if args.menu: files = [entities / 'Menu.nmo', entities / 'MenuLevel.nmo']
    for file in files:
        handle = P()
        encodings = (C.c_char_p * 2)(b'windows-1252', b'utf-8')
        if not loader(file.as_posix().encode(), temp.resolve().as_posix().encode(), (game / 'Textures').resolve().as_posix().encode(), log, 2, encodings, C.byref(handle)):
            raise RuntimeError(f'Cannot load {file}')
        def get(name, object_id=None, kind=U, index=None):
            types, values = [P], [handle]
            if object_id is not None: types.append(U); values.append(object_id)
            if index is not None: types.append(U); values.append(index)
            result = kind(); types.append(C.POINTER(kind)); values.append(C.byref(result))
            if not function(name, types)(*values): raise RuntimeError(f'{name} failed for {object_id}')
            return result
        def value(name, object_id=None, kind=U, index=None):
            return get(name, object_id, kind, index).value
        def name(object_id):
            return (value('BMObject_GetName', object_id, C.c_char_p) or b'').decode('utf-8', 'replace')
        def ids(category):
            return [value(f'BMFile_Get{category}', index=i) for i in range(value(f'BMFile_Get{category}Count'))]
        def floats(api, object_id, count):
            data = value(api, object_id, P)
            return [round(v, 7) for v in C.cast(data, C.POINTER(F * count)).contents] if count else []
        def words(api, object_id, count):
            data = value(api, object_id, P)
            return list(C.cast(data, C.POINTER(C.c_uint16 * count)).contents) if count else []
        document = {'version': 1, 'source': file.name, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest(), 'objects': [], 'meshes': [], 'materials': [], 'textures': [], 'groups': []}
        for tid in ids('Texture'):
            original = (value('BMTexture_GetFileName', tid, C.c_char_p) or b'').decode('utf-8', 'replace').replace('\\', '/')
            filename = (Path(original).stem or f'texture-{tid}') + '.png'
            dest = output / 'textures' / filename
            save = function('BMTexture_SaveImage', [P, U, C.c_char_p])
            if not save(handle, tid, dest.resolve().as_posix().encode()): raise RuntimeError(f'Cannot export texture {original}')
            document['textures'].append({'id': tid, 'name': name(tid), 'source': original, 'file': f'textures/{filename}'})
        for mid in ids('Material'):
            entry = {'id': mid, 'name': name(mid), 'texture': value('BMMaterial_GetTexture', mid)}
            for field in ['Diffuse', 'Ambient', 'Specular', 'Emissive']:
                entry[field.lower()] = list(get('BMMaterial_Get' + field, mid, Color).values)
            for field in ['AlphaBlendEnabled', 'AlphaTestEnabled', 'TwoSidedEnabled', 'ZWriteEnabled']:
                entry[field] = value('BMMaterial_Get' + field, mid, C.c_bool)
            # Original CKMaterial alpha-test state: AlphaRef is the raw CKBYTE
            # reference (compared as alphaRef/255) and AlphaFunc is the D3D8
            # D3DCMP comparison code (1..8) used by the original renderer.
            entry['alphaRef'] = value('BMMaterial_GetAlphaRef', mid, C.c_ubyte)
            entry['alphaFunc'] = value('BMMaterial_GetAlphaFunc', mid)
            entry['sourceBlend'] = value('BMMaterial_GetSourceBlend', mid)
            entry['destBlend'] = value('BMMaterial_GetDestBlend', mid)
            entry['textureBlendMode'] = value('BMMaterial_GetTextureBlendMode', mid)
            entry['textureMinMode'] = value('BMMaterial_GetTextureMinMode', mid)
            entry['textureMagMode'] = value('BMMaterial_GetTextureMagMode', mid)
            entry['textureAddressMode'] = value('BMMaterial_GetTextureAddressMode', mid)
            entry['textureBorderColor'] = list(get('BMMaterial_GetTextureBorderColor', mid, Color).values)
            entry['specularPower'] = value('BMMaterial_GetSpecularPower', mid, C.c_float)
            document['materials'].append(entry)
        for mid in ids('Mesh'):
            vc, fc = value('BMMesh_GetVertexCount', mid), value('BMMesh_GetFaceCount', mid)
            document['meshes'].append({'id': mid, 'name': name(mid), 'positions': floats('BMMesh_GetVertexPositions', mid, vc * 3), 'normals': floats('BMMesh_GetVertexNormals', mid, vc * 3), 'uvs': floats('BMMesh_GetVertexUVs', mid, vc * 2), 'indices': words('BMMesh_GetFaceIndices', mid, fc * 3), 'faceMaterials': words('BMMesh_GetFaceMaterialSlotIndexs', mid, fc), 'materials': [value('BMMesh_GetMaterialSlot', mid, index=i) for i in range(value('BMMesh_GetMaterialSlotCount', mid))]})
        for oid in ids('3dObject'):
            document['objects'].append({'id': oid, 'name': name(oid), 'mesh': value('BM3dEntity_GetCurrentMesh', oid), 'matrix': list(get('BM3dEntity_GetWorldMatrix', oid, Matrix).values), 'visible': value('BM3dEntity_GetVisibility', oid, C.c_bool)})
        for gid in ids('Group'):
            document['groups'].append({'name': name(gid), 'members': [value('BMGroup_GetObject', gid, index=i) for i in range(value('BMGroup_GetObjectCount', gid))]})
        target = output / (file.stem.lower() + '.json')
        target.write_text(json.dumps(document, separators=(',', ':')))
        print(f'EXPORTED {file.name}: {len(document["objects"])} objects, {len(document["meshes"])} meshes, {len(document["textures"])} textures -> {target}')
        free(handle)
    dispose()

if __name__ == '__main__': main()
