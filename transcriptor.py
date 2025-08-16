import os
import json

# Ruta al directorio donde está este archivo .py
base_dir = os.path.dirname(os.path.abspath(__file__))

# Carpeta /imagenes dentro del mismo directorio
imagenes_dir = os.path.join(base_dir, "media/PRODUCTOS")

# Obtenemos los nombres de los archivos sin extensión
nombres = [
    os.path.splitext(archivo)[0]
    for archivo in os.listdir(imagenes_dir)
    if os.path.isfile(os.path.join(imagenes_dir, archivo))
]

# Guardamos en un JSON en el mismo directorio del script
salida_json = os.path.join(base_dir, "Habilitados.json")
with open(salida_json, "w", encoding="utf-8") as f:
    json.dump(nombres, f, ensure_ascii=False, indent=2)

print(f"✅ Se guardaron los nombres en '{salida_json}'")
