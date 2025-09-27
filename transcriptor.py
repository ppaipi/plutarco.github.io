import os
import json
from PIL import Image

# Ruta base = donde está este archivo .py
base_dir = os.path.dirname(os.path.abspath(__file__))

# Carpeta de imágenes
imagenes_dir = os.path.join(base_dir, "media/PRODUCTOS")

def convertir_a_jpg_reemplazo(carpeta):
    """
    Convierte imágenes a JPG reemplazando los archivos originales.
    """
    for archivo in os.listdir(carpeta):
        ruta_archivo = os.path.join(carpeta, archivo)

        if not os.path.isfile(ruta_archivo):
            continue

        nombre, extension = os.path.splitext(archivo)
        extension = extension.lower()

        try:
            with Image.open(ruta_archivo) as img:
                img = img.convert("RGB")  # JPG no soporta transparencia

                ruta_salida = os.path.join(carpeta, f"{nombre}.jpg")

                # Guardar como JPG
                img.save(ruta_salida, "JPEG", quality=95)

            # Si no era ya .jpg → eliminar original
            if extension != ".jpg":
                os.remove(ruta_archivo)
                print(f"♻️ Reemplazado: {archivo} → {nombre}.jpg")
            else:
                print(f"✅ Ya era JPG: {archivo}")

        except Exception as e:
            print(f"⚠️ Error con {archivo}: {e}")

def generar_json(carpeta, salida):
    """
    Genera un JSON con los nombres de archivo (sin extensión).
    """
    nombres = [
        os.path.splitext(archivo)[0]
        for archivo in os.listdir(carpeta)
        if os.path.isfile(os.path.join(carpeta, archivo)) and archivo.lower().endswith(".jpg")
    ]

    with open(salida, "w", encoding="utf-8") as f:
        json.dump(nombres, f, ensure_ascii=False, indent=2)

    print(f"📄 JSON generado en: {salida}")

if __name__ == "__main__":
    # Paso 1: convertir imágenes reemplazando originales
    convertir_a_jpg_reemplazo(imagenes_dir)

    # Paso 2: generar JSON con nombres
    salida_json = os.path.join(base_dir, "Habilitados.json")
    generar_json(imagenes_dir, salida_json)
