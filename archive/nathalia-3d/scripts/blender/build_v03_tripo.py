"""Build web-budget runtime GLB from the isolated Tripo v03 hero body.
Operates on _v03_body.blend (already box-cropped front figure, centered, 1.6m,
facing +X). Rotates to face -Y (contract), decimates, shrinks textures, Draco-exports.
Run: blender --background --python build_v03_tripo.py -- --apply"""
import bpy, math, mathutils, os, sys
APPLY="--apply" in sys.argv
BODY=r"C:\Code\jumpflow\packages\character-nathalia\assets\blender\_v03_body.blend"
MODELS=r"C:\Code\jumpflow\packages\character-nathalia\assets\models"
OUT_GLB=os.path.join(MODELS,"master_v3_tripo_preview.glb")
OUT_BLEND=r"C:\Code\jumpflow\packages\character-nathalia\assets\blender\master_v3_tripo.blend"
OUT_IMG=r"C:\Code\jumpflow\docs\nathalia\audit-screenshots\v03-eval"
TARGET=24000
bpy.ops.wm.open_mainfile(filepath=BODY)
obj=[o for o in bpy.data.objects if o.type=='MESH'][0]
bpy.context.view_layer.objects.active=obj
# face +X -> -Y : rotate -90 about Z
obj.rotation_euler=(0,0,math.radians(-90)); bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
bpy.ops.object.transform_apply(rotation=True)
me=obj.data; me.calc_loop_triangles(); pre=len(me.loop_triangles)
dec=obj.modifiers.new("d",'DECIMATE'); dec.ratio=min(1.0,TARGET/pre)
bpy.ops.object.modifier_apply(modifier="d")
me=obj.data; me.calc_loop_triangles()
for img in bpy.data.images:
    if not img.size[0]: continue
    n=img.name.lower(); t=768 if "base" in n or "color" in n else 256
    if img.size[0]>t: img.scale(t,t)
print(f"tris {pre}->{len(me.loop_triangles)}")
if APPLY:
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=OUT_GLB,use_selection=True,export_format='GLB',
        export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_yup=True)
    print(f"EXPORTED {os.path.getsize(OUT_GLB)/1024:.1f} KB")
    # hero render from -Y (front), upright
    sc=bpy.context.scene;sc.render.engine='BLENDER_EEVEE';sc.render.resolution_x=480;sc.render.resolution_y=680;sc.render.film_transparent=True
    w=bpy.data.worlds.new("W");w.use_nodes=True;w.node_tree.nodes["Background"].inputs[1].default_value=1.2;sc.world=w
    for ang,e in [((math.radians(55),0,math.radians(20)),3.0),((math.radians(60),0,math.radians(200)),1.2)]:
        L=bpy.data.lights.new("S",'SUN');L.energy=e;lo=bpy.data.objects.new("S",L);bpy.context.collection.objects.link(lo);lo.rotation_euler=ang
    cam=bpy.data.cameras.new("C");cam.lens=45;co=bpy.data.objects.new("C",cam);bpy.context.collection.objects.link(co);sc.camera=co
    cos=[obj.matrix_world@v.co for v in obj.data.vertices]
    xs=[c.x for c in cos];ys=[c.y for c in cos];zs=[c.z for c in cos]
    ctrv=mathutils.Vector(((min(xs)+max(xs))/2,(min(ys)+max(ys))/2,(min(zs)+max(zs))/2));H=max(zs)-min(zs)
    def shoot(name,off):
        co.location=ctrv+mathutils.Vector(off);co.rotation_euler=(ctrv-co.location).normalized().to_track_quat('-Z','Z').to_euler()
        sc.render.filepath=os.path.join(OUT_IMG,name);bpy.ops.render.render(write_still=True)
    shoot("HERO-front.png",(0,-H*1.5,0))
    shoot("HERO-3q.png",(-H*1.1,-H*1.1,0))
    # bust crop (face+shoulders) for widget comparison
    bz=max(zs)-H*0.32
    co.data.lens=70; ctrb=mathutils.Vector((ctrv.x,ctrv.y,max(zs)-H*0.14))
    co.location=ctrb+mathutils.Vector((0,-H*0.9,0));co.rotation_euler=(ctrb-co.location).normalized().to_track_quat('-Z','Z').to_euler()
    sc.render.resolution_x=400;sc.render.resolution_y=400
    sc.render.filepath=os.path.join(OUT_IMG,"HERO-bust.png");bpy.ops.render.render(write_still=True)
    print("RENDERED")
