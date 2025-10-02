import os
import json
import re
import unicodedata
import pandas as pd
from PIL import Image

# ---------------------------
# Config
# ---------------------------
base_dir = os.path.dirname(os.path.abspath(__file__))
imagenes_dir = os.path.join(base_dir, "media/PRODUCTOS")
json_habilitados = os.path.join(base_dir, "media/Habilitados.json")
excel_original = os.path.join(base_dir, "media/articulos.xlsx")
excel_filtrado = os.path.join(base_dir, "media/articulos_filtrados.xlsx")

# ---------------------------
# Util: normalizar códigos
# ---------------------------
def normalize_code(s):
    """
    Normaliza un código:
    - convierte a str, NFKD (quita acentos), lower,
    - quita espacios, y caracteres no alfanuméricos.
    Resultado: solo [a-z0-9] (sin espacios ni acentos).
    """
    if s is None:
        return ""
    s = str(s)
    # Normalizar Unicode y quitar marcas (acentos)
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower().strip()
    # quitar espacios
    s = re.sub(r'\s+', '', s)
    # conservar solo caracteres alfanuméricos (si querés permitir '-' cambiar aquí)
    s = re.sub(r'[^a-z0-9]', '', s)
    return s

# ---------------------------
# Paso 1: convertir imágenes (reemplazo)
# ---------------------------
def convertir_a_jpg_reemplazo(carpeta):
    """
    Convierte cualquier imagen que no sea .jpg a JPG,
    reemplazando el archivo original.
    """
    for archivo in os.listdir(carpeta):
        ruta_archivo = os.path.join(carpeta, archivo)

        if not os.path.isfile(ruta_archivo):
            continue

        nombre, extension = os.path.splitext(archivo)
        extension = extension.lower()

        # Si ya es .jpg → no hacer nada
        if extension == ".jpg":
            print(f"✅ Ya es JPG: {archivo}")
            continue

        try:
            with Image.open(ruta_archivo) as img:
                img = img.convert("RGB")  # JPG no soporta transparencia
                ruta_salida = os.path.join(carpeta, f"{nombre}.jpg")
                img.save(ruta_salida, "JPEG", quality=95)

            os.remove(ruta_archivo)  # borrar original
            print(f"♻️ Reemplazado: {archivo} → {nombre}.jpg")
        except Exception as e:
            print(f"⚠️ Error con {archivo}: {e}")

# ---------------------------
# Paso 2: generar JSON (nombres tal como están)
# ---------------------------
def generar_json(carpeta, salida):
    nombres = [
        os.path.splitext(archivo)[0]
        for archivo in os.listdir(carpeta)
        if os.path.isfile(os.path.join(carpeta, archivo)) and archivo.lower().endswith(".jpg")
    ]

    with open(salida, "w", encoding="utf-8") as f:
        json.dump(nombres, f, ensure_ascii=False, indent=2)

    print(f"📄 JSON generado en: {salida}  (total: {len(nombres)})")
    return nombres

# ---------------------------
# Paso 3: filtrar Excel usando normalización
# ---------------------------
def filtrar_excel_por_json(excel_path, json_path, salida_path):
    # Leer JSON (nombres originales)
    with open(json_path, "r", encoding="utf-8") as f:
        json_codes_raw = json.load(f)

    # Normalizar los códigos del JSON para comparar
    norm_json_map = {}
    for raw in json_codes_raw:
        nc = normalize_code(raw)
        if nc:
            # map normalizado -> lista de raw (por si hay colisiones)
            norm_json_map.setdefault(nc, []).append(raw)
    norm_json_set = set(norm_json_map.keys())

    # Leer Excel (forzando strings)
    df = pd.read_excel(excel_path, dtype=str)

    # Buscar columna CODIGO BARRA (insensible a mayúsculas/espacios)
    # Buscar columna CODIGO BARRA (insensible a mayúsculas/espacios)
    colname = None
    for col in df.columns:
        normalized_col = col.strip().lower().replace(" ", "")
        if normalized_col in ("codigodebarra", "codigobarra", "codigo", "codigo_barra"):
            colname = col
            break
    if colname is None:
        raise ValueError(
            "❌ No se encontró la columna de códigos en el Excel. "
            "Columnas disponibles: " + ", ".join(df.columns)
        )

    # Crear columna normalizada en el dataframe
    df["_norm_code"] = df[colname].astype(str).apply(normalize_code)

    # Filtrar usando el set normalizado
    df_filtrado = df[df["_norm_code"].isin(norm_json_set)].copy()
    df_filtrado.drop(columns=["_norm_code"], inplace=True)

    # Guardar Excel filtrado
    df_filtrado.to_excel(salida_path, index=False)
    print(f"✅ Excel filtrado guardado en: {salida_path} (filas: {len(df_filtrado)})")

    # Diagnóstico: qué códigos hay en JSON que no aparecen en el Excel, y viceversa
    codes_in_excel = set(df["_norm_code"].dropna().unique())
    missing_in_excel = sorted(list(norm_json_set - codes_in_excel))
    missing_in_json = sorted(list(codes_in_excel - norm_json_set))

    # Guardar/mostrar diagnósticos
    diag_dir = os.path.join(base_dir, "media")
    with open(os.path.join(diag_dir, "habilitados_no_en_excel.json"), "w", encoding="utf-8") as f:
        json.dump(missing_in_excel, f, ensure_ascii=False, indent=2)
    with open(os.path.join(diag_dir, "codigos_excel_no_en_habilitados.json"), "w", encoding="utf-8") as f:
        json.dump(missing_in_json, f, ensure_ascii=False, indent=2)

    print(f"ℹ️ Códigos del JSON que NO están en el Excel: {len(missing_in_excel)} (guardado en media/habilitados_no_en_excel.json)")
    print(f"ℹ️ Códigos del Excel que NO están en el JSON: {len(missing_in_json)} (guardado en media/codigos_excel_no_en_habilitados.json)")

    # Opcional: devolver dataframes para uso programático
    return df_filtrado, missing_in_excel, missing_in_json

# ---------------------------
# MAIN
# ---------------------------
if __name__ == "__main__":
    # 1) convertir imágenes (reemplazo)
    convertir_a_jpg_reemplazo(imagenes_dir)

    # 2) generar JSON (nombres tal cual)
    generar_json(imagenes_dir, json_habilitados)

    # 3) filtrar Excel comparando con JSON (con normalización)
    filtrar_excel_por_json(excel_original, json_habilitados, excel_filtrado)
