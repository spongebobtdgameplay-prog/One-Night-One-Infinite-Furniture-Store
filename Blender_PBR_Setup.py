import bpy
import os

def FindTexture(Folder, Stem, Suffixes):
    for Suffix in Suffixes:
        for Extension in [".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".exr"]:
            Candidate = os.path.join(Folder, Stem + Suffix + Extension)
            if os.path.exists(Candidate):
                return Candidate
    return None

def AddImageNode(Nodes, Path, Label, NonColor=False):
    Image = bpy.data.images.load(Path, check_existing=True)
    if NonColor:
        Image.colorspace_settings.name = "Non-Color"
    Node = Nodes.new("ShaderNodeTexImage")
    Node.image = Image
    Node.label = Label
    Node.name = Label
    return Node

def BuildPbrMaterial(Object, TextureFolder, Stem, MaterialName=None):
    Material = bpy.data.materials.new(MaterialName or Stem)
    Material.use_nodes = True

    Nodes = Material.node_tree.nodes
    Links = Material.node_tree.links
    Nodes.clear()

    Output = Nodes.new("ShaderNodeOutputMaterial")
    Output.location = (900, 0)

    Principled = Nodes.new("ShaderNodeBsdfPrincipled")
    Principled.location = (560, 0)

    Links.new(Principled.outputs["BSDF"], Output.inputs["Surface"])

    BasePath = FindTexture(TextureFolder, Stem, ["_BaseColor", "_Albedo", "_Color", "_Diffuse"])
    RoughPath = FindTexture(TextureFolder, Stem, ["_Roughness", "_Rough"])
    MetalPath = FindTexture(TextureFolder, Stem, ["_Metallic", "_Metalness", "_Metal"])
    NormalPath = FindTexture(TextureFolder, Stem, ["_NormalGL", "_Normal", "_Normal_OpenGL"])
    AoPath = FindTexture(TextureFolder, Stem, ["_AO", "_AmbientOcclusion"])

    BaseNode = None
    if BasePath:
        BaseNode = AddImageNode(Nodes, BasePath, "BaseColor")
        BaseNode.location = (-700, 220)
        Links.new(BaseNode.outputs["Color"], Principled.inputs["Base Color"])

    if RoughPath:
        RoughNode = AddImageNode(Nodes, RoughPath, "Roughness", True)
        RoughNode.location = (-700, 20)
        Links.new(RoughNode.outputs["Color"], Principled.inputs["Roughness"])

    if MetalPath:
        MetalNode = AddImageNode(Nodes, MetalPath, "Metallic", True)
        MetalNode.location = (-700, -160)
        Links.new(MetalNode.outputs["Color"], Principled.inputs["Metallic"])

    if NormalPath:
        NormalNode = AddImageNode(Nodes, NormalPath, "Normal", True)
        NormalNode.location = (-700, -360)
        NormalMap = Nodes.new("ShaderNodeNormalMap")
        NormalMap.location = (-360, -360)
        Links.new(NormalNode.outputs["Color"], NormalMap.inputs["Color"])
        Links.new(NormalMap.outputs["Normal"], Principled.inputs["Normal"])

    if AoPath and BaseNode:
        AoNode = AddImageNode(Nodes, AoPath, "AO", True)
        AoNode.location = (-700, 420)
        Mix = Nodes.new("ShaderNodeMixRGB")
        Mix.blend_type = "MULTIPLY"
        Mix.inputs["Fac"].default_value = 1.0
        Mix.location = (-80, 220)
        Links.new(BaseNode.outputs["Color"], Mix.inputs[1])
        Links.new(AoNode.outputs["Color"], Mix.inputs[2])
        Links.new(Mix.outputs["Color"], Principled.inputs["Base Color"])

    Object.data.materials.clear()
    Object.data.materials.append(Material)
    return Material

# Usage:
# Select one mesh, then edit these two values:
TextureFolder = r"C:\YourGame\assets\textures\pbr\RustySteel"
TextureStem = "RustySteel"

if bpy.context.active_object and bpy.context.active_object.type == "MESH":
    BuildPbrMaterial(bpy.context.active_object, TextureFolder, TextureStem)
