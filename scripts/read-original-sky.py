#!/usr/bin/env python3
"""Recover the Gameplay_Sky / Skytextures chain without executing NMO code.

Inputs are dump-chunks TSVs (see scripts/dump-original-chunks.cpp):
  Levelinit.tsv  -> Skytextures DataArray, AllLevel DataArray, Load Sky-Textures, init SkyLayer
  Gameplay.tsv   -> Gameplay_Init binding, Gameplay_Sky graph, TT Sky, fadeout Sky

Every recovered value is asserted against the authored storage, so unsupported
layouts fail instead of emitting guessed data.
"""
import argparse
import json
import struct
from original_chunks import ChunkDump, chunks, table

parser = argparse.ArgumentParser()
parser.add_argument('levelinit_dump')
parser.add_argument('gameplay_dump')
args = parser.parse_args()

TEXT = 'e210d06bea175611'
FLOATS = ('3f4c8847202c2c43', '2b42b4544f0f0f73', 'f52c26113a23b030', '4e4bc8f334ccfa0f')
COLOR4 = 'ee2fd457913bbb7c'
VECTOR2 = '4ab3fc4e2fe47960'
BOOL = '8e2ad51a2019745e'
INT = 'fd16575ad776e244'

def value(d, index):
    kind, name, data = d.rows[index]
    if kind == 2:
        return value(d, struct.unpack_from('<I', data, 24)[0])
    if kind in (3, 45):
        offset = chunks(data)[0x40]
        guid = data[offset:offset + 8].hex()
        mode, = struct.unpack_from('<I', data, offset + 8)
        if mode == 2:
            ref, = struct.unpack_from('<I', data, offset + 12)
            if ref == 0xffffffff:
                return name
            return d.rows[ref][1]
        if mode != 1:
            # Message-typed locals use a different payload layout; they are not
            # part of the recovered sky values.
            return name
        length, = struct.unpack_from('<I', data, offset + 12)
        raw = data[offset + 16:offset + 16 + length]
        if guid == TEXT:
            return raw.split(b'\0')[0].decode('windows-1252')
        if guid == COLOR4:
            assert length == 16, (index, name, length)
            return list(struct.unpack('<4f', raw))
        if guid == VECTOR2:
            assert length == 8, (index, name, length)
            return list(struct.unpack('<2f', raw))
        if guid in FLOATS:
            assert length == 4, (index, name, length)
            return struct.unpack('<f', raw)[0]
        if guid in (BOOL, INT):
            return bool(struct.unpack('<I', raw)[0]) if guid == BOOL else struct.unpack('<i', raw)[0]
        if length == 4:
            return struct.unpack('<i', raw)[0]
        if length == 8:
            return list(struct.unpack('<2f', raw))
        if length == 16:
            return list(struct.unpack('<4f', raw))
        return raw.hex()
    return name

def behavior(d, name):
    rows = [i for i in d.rows if d.rows[i][0] == 8 and d.rows[i][1] == name]
    assert len(rows) == 1, (name, rows)
    return rows[0]

def data_array(d, name):
    rows = [i for i in d.rows if d.rows[i][0] == 52 and d.rows[i][1] == name]
    assert len(rows) == 1, (name, rows)
    return rows[0]

def named_locals(d, index):
    definition = d.definition(index)
    return {d.rows[r][1]: value(d, r) for r in definition.get('locals', [])}

def local_pairs(d, index):
    return [(d.rows[r][1], value(d, r)) for r in d.definition(index).get('locals', [])]

def present_values(d, index):
    return [value(d, r) for r in d.definition(index).get('locals', [])]

def child_by_name(d, parent, name):
    definition = d.definition(parent)
    children = [c for c in definition.get('children', []) if d.rows[c][1] == name]
    assert len(children) == 1, (name, children)
    return children[0]

def child_by_target(d, parent, name, target):
    definition = d.definition(parent)
    children = [c for c in definition.get('children', [])
                if d.rows[c][1] == name and d.definition(c).get('target') == target]
    assert len(children) == 1, (name, target, children)
    return children[0]

levelinit = ChunkDump(args.levelinit_dump)
gameplay = ChunkDump(args.gameplay_dump)

# --- Skytextures: the five material cells read by Gameplay_Sky -------------- #
skytextures = data_array(levelinit, 'Skytextures')
rows = table(levelinit.rows[skytextures][2])
assert len(rows) == 1 and list(rows[0]) == ['Back', 'Right', 'Front', 'Left', 'Down'], rows
materials = []
for column in ['Back', 'Right', 'Front', 'Left', 'Down']:
    cell = rows[0][column]['parameterIndex']
    resolved = value(levelinit, cell)
    materials.append(resolved)
assert materials == ['Sky_Back', 'Sky_Right', 'Sky_Front', 'Sky_Left', 'Sky_Down'], materials

# --- AllLevel: exact level -> sky set, scroll velocity and light color ------ #
all_level = data_array(levelinit, 'AllLevel')
levels = table(levelinit.rows[all_level][2])
assert len(levels) == 12, len(levels)
result_levels = []
for row in levels:
    sky = row['Sky']
    assert sky.startswith('Sky_') and len(sky) == 5, sky
    light = value(levelinit, row['Light']['parameterIndex'])
    scroll = value(levelinit, row['Skytranslation']['parameterIndex'])
    assert len(light) == 4 and len(scroll) == 2, (sky, light, scroll)
    level_number = int(row['Levelfile'].split('_')[1].split('.')[0])
    result_levels.append({'level': level_number, 'file': row['Levelfile'], 'sky': sky,
                          'letter': sky.split('_')[1], 'scroll': scroll, 'light': light})
assert [entry['level'] for entry in result_levels] == list(range(1, 13))

# --- Load Sky-Textures: texture name construction and directory choice ------ #
loader = behavior(levelinit, 'Load Sky-Textures')
loader_values = present_values(levelinit, loader)
suffixes = ['_Back', '_Right', '_Front', '_Left', '_Down']
for suffix in suffixes:
    assert suffix in loader_values, (suffix, loader_values)
assert 'Textures\\' in loader_values, loader_values
assert 'Sky' in loader_values, loader_values
directories = [v for v in loader_values if v in ('sky\\', 'sky_low\\')]
assert sorted(directories) == ['sky\\', 'sky_low\\'], directories
sky_column = None
game_settings_columns = set()
for child in levelinit.definition(loader).get('children', []):
    if levelinit.rows[child][1] != 'Get Cell':
        continue
    target = levelinit.definition(child).get('target')
    inputs = [value(levelinit, r) for r in levelinit.definition(child)['inputs']]
    if target == 'AllLevel' and inputs[1] == 3:
        sky_column = inputs[1]
    if target == 'GameSettings Array':
        game_settings_columns.add(inputs[1])
assert sky_column == 3, sky_column
assert 13 in game_settings_columns, game_settings_columns

# --- init SkyLayer: runtime material overrides ------------------------------ #
init_sky = behavior(levelinit, 'init SkyLayer')
init_locals = named_locals(levelinit, init_sky)
prelit = next(v for v in init_locals.values() if isinstance(v, list) and len(v) == 4 and abs(v[0] - 200 / 255) < 1e-5)
additional = next(v for v in init_locals.values() if isinstance(v, list) and len(v) == 4 and v[:3] == [0.0, 0.0, 0.0])
assert additional[:3] == [0.0, 0.0, 0.0], additional

# --- Gameplay_Init: binds the levelinit DataArray into the sky local -------- #
gameplay_init = behavior(gameplay, 'Gameplay_Init')
init_pairs = local_pairs(gameplay, gameplay_init)
assert any(name == 'p1' and text == 'Skytextures' for name, text in init_pairs), init_pairs
assert any(name == 'Skytextures Array' for name, _ in init_pairs), init_pairs

# --- Gameplay_Sky: TT Sky parameters, gate and scroller --------------------- #
sky_script = behavior(gameplay, 'Gameplay_Sky')
sky_locals = named_locals(gameplay, sky_script)
assert sky_locals.get('SkyLayer Entity') == 'SkyLayer Entity'
assert sky_locals.get('Skytranslation') == [0.0, 0.0]
gate_local = None
for r in gameplay.definition(sky_script)['locals']:
    if gameplay.rows[r][1] == 'Skylayer ein?':
        gate_local = r
assert gate_local is not None

tt_sky = child_by_name(gameplay, sky_script, 'TT Sky')
tt_params = named_locals(gameplay, tt_sky)
tt_definition = gameplay.definition(tt_sky)
for r in tt_definition.get('inputs', []):
    tt_params[gameplay.rows[r][1]] = value(gameplay, r)
assert abs(tt_params['Distortion'] - 0.15) < 1e-6, tt_params['Distortion']
assert tt_params['Radius'] == 100.0 and tt_params['or SideFace-Heigth'] == 10.0
assert tt_params['Y-Position of Sky'] == 0.0 and tt_params['Quadratic SideFaces?'] is True
vertex_color = next(v for v in tt_params.values() if v == [1.0, 1.0, 1.0, 1.0])
assert vertex_color == [1.0, 1.0, 1.0, 1.0]

get_cell = child_by_target(gameplay, sky_script, 'Get Cell', 'DB_Options Array')
outputs = gameplay.definition(get_cell).get('outputs', [])
assert len(outputs) == 1, outputs
output_data = gameplay.rows[outputs[0]][2]
# The parameter-out chunk embeds the shared local it feeds (Skylayer ein?).
assert struct.pack('<I', gate_local) in output_data, (outputs[0], gate_local)
gate_inputs = [value(gameplay, r) for r in gameplay.definition(get_cell)['inputs']]
assert gate_inputs == [0, 10], gate_inputs

animate = child_by_name(gameplay, sky_script, 'animate SkyLayer')
for child in gameplay.definition(animate).get('children', []):
    if gameplay.rows[child][1] != 'Binary Switch':
        continue
    condition = gameplay.definition(child)['inputs'][0]
    assert struct.unpack_from('<I', gameplay.rows[condition][2], 24)[0] == gate_local, child
scroller = child_by_target(gameplay, animate, 'Texture Scroller', 'Mesh')
scroller_inputs = [value(gameplay, r) for r in gameplay.definition(scroller)['inputs']]
assert scroller_inputs[1] == -1, scroller_inputs
per_second = child_by_name(gameplay, animate, 'Per Second')
per_second_inputs = [value(gameplay, r) for r in gameplay.definition(per_second)['inputs']]
assert per_second_inputs == [[0.0, 0.0]], per_second_inputs

# --- fadeout Sky: prelit color fade at the ending --------------------------- #
fade = behavior(gameplay, 'fadeout Sky')
fade_locals = named_locals(gameplay, fade)
duration = next(v for v in fade_locals.values() if v == 3000.0)
fade_from = next(v for v in fade_locals.values() if isinstance(v, list) and len(v) == 4 and abs(v[0] - 200 / 255) < 1e-5)
fade_to = next(v for v in fade_locals.values() if isinstance(v, list) and len(v) == 4 and v[:3] == [0.0, 0.0, 0.0])
assert duration == 3000.0

result = {
    'source': 'Levelinit.nmo, Gameplay.nmo',
    'populate': {
        'array': 'Skytextures',
        'binding': 'Gameplay_Init resolves the object named Skytextures into the Gameplay_Sky local Skytextures Array',
        'script': 'Load Sky-Textures',
        'pathPrefix': 'Textures\\',
        'namePrefix': 'Sky',
        'skyColumn': sky_column,
        'qualityColumns': sorted(game_settings_columns),
    },
    'dome': {
        'arrayColumns': ['Back', 'Right', 'Front', 'Left', 'Down'],
        'materials': materials,
        'textureSuffixes': suffixes,
        'directories': {'sky_low': 'sky_low\\', 'sky': 'sky\\'},
        'radius': tt_params['Radius'],
        'sideHeight': tt_params['or SideFace-Heigth'],
        'distortion': tt_params['Distortion'],
        'quadraticSides': tt_params['Quadratic SideFaces?'],
        'yPosition': tt_params['Y-Position of Sky'],
        'vertexColor': vertex_color,
    },
    'layer': {
        'name': 'SkyLayer',
        'scrollTarget': 'SkyLayer_Mesh',
        'channel': scroller_inputs[1],
        'prelit': prelit,
        'additional': additional,
        'fadeMs': duration,
        'fadeTo': fade_to,
    },
    'gate': {
        'local': 'Skylayer ein?',
        'array': 'DB_Options',
        'row': gate_inputs[0],
        'column': gate_inputs[1],
        'label': 'Menu_Opt_Graphics Clouds',
    },
    'levels': result_levels,
}
print(json.dumps(result, indent=2))
