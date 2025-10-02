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
excel_facebook = os.path.join(base_dir, "media/articulos_facebook.csv")

# ---------------------------
# Util: normalizar códigos
# ---------------------------
def normalize_code(s):
    if s is None:
        return ""
    s = str(s)
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower().strip()
    s = re.sub(r'\s+', '', s)
    s = re.sub(r'[^a-z0-9]', '', s)
    return s

# ---------------------------
# Paso 1: convertir imágenes (reemplazo)
# ---------------------------
def convertir_a_jpg_reemplazo(carpeta):
    for archivo in os.listdir(carpeta):
        ruta_archivo = os.path.join(carpeta, archivo)
        if not os.path.isfile(ruta_archivo):
            continue
        nombre, extension = os.path.splitext(archivo)
        extension = extension.lower()
        if extension == ".jpg":
            continue
        try:
            with Image.open(ruta_archivo) as img:
                img = img.convert("RGB")
                ruta_salida = os.path.join(carpeta, f"{nombre}.jpg")
                img.save(ruta_salida, "JPEG", quality=95)
            os.remove(ruta_archivo)
        except Exception as e:
            print(f"⚠️ Error con {archivo}: {e}")

# ---------------------------
# Paso 2: generar JSON de habilitados
# ---------------------------
def generar_json(carpeta, salida):
    nombres = [
        os.path.splitext(archivo)[0]
        for archivo in os.listdir(carpeta)
        if os.path.isfile(os.path.join(carpeta, archivo)) and archivo.lower().endswith(".jpg")
    ]
    with open(salida, "w", encoding="utf-8") as f:
        json.dump(nombres, f, ensure_ascii=False, indent=2)
    return nombres

# ---------------------------
# Paso 3: filtrar Excel
# ---------------------------
def filtrar_excel_por_json(excel_path, json_path, salida_path):
    with open(json_path, "r", encoding="utf-8") as f:
        json_codes_raw = json.load(f)

    norm_json_set = {normalize_code(raw) for raw in json_codes_raw if raw}
    df = pd.read_excel(excel_path, dtype=str)

    colname = None
    for col in df.columns:
        normalized_col = col.strip().lower().replace(" ", "")
        if normalized_col in ("codigodebarra", "codigobarra", "codigo", "codigo_barra"):
            colname = col
            break
    if colname is None:
        raise ValueError("❌ No se encontró la columna de códigos en el Excel. Columnas: " + ", ".join(df.columns))

    df["_norm_code"] = df[colname].astype(str).apply(normalize_code)
    df_filtrado = df[df["_norm_code"].isin(norm_json_set)].copy()
    df_filtrado.drop(columns=["_norm_code"], inplace=True)

    df_filtrado.to_excel(salida_path, index=False)
    print(f"✅ Excel filtrado guardado en: {salida_path} (filas: {len(df_filtrado)})")

    return df_filtrado

# ---------------------------
# Paso 4: generar CSV Facebook
# ---------------------------
def generar_excel_facebook(df, salida_path):
    # Columnas que Facebook necesita
    columnas_fb = [
        "id", "title", "description", "availability", "condition", "price",
        "link", "image_link", "brand"
    ]

    df_fb = pd.DataFrame(columns=columnas_fb)

    for i, row in df.iterrows():
        # ID → CODIGO BARRA
        codigo = str(row.get("CODIGO BARRA", "")).strip()

        # Title → DESCRIPCION
        title = str(row.get("DESCRIPCION", "")).strip()

        # Description → ADICIONAL > LARGA > DESCRIPCION
        desc = str(
            row.get("DESCRIPCION ADICIONAL") or
            row.get("DESCRIPCION LARGA") or
            row.get("DESCRIPCION") or ""
        )
        desc = "" if desc == "nan" else desc.strip()

        # Availability (siempre en stock)
        availability = "in stock"

        # Condition
        condition = "new"

        # Precio (precio venta con IVA)
        try:
            precio = float(str(row.get("PRECIO VENTA C/IVA", "0")).replace(",", "."))
        except:
            precio = 0.0
        price = f"{precio:.2f} ARS"

        # Link del producto (genérico con código)
        link = f"https://plutarcoalmacen.com.ar/producto/{codigo}"

        # Imagen (debe existir en carpeta PRODUCTOS)
        image_link = f"https://plutarcoalmacen.com.ar/media/PRODUCTOS/{codigo}.jpg"

        # Marca
        brand = str(row.get("MARCA", "Plutarco")).strip()

        df_fb.loc[i] = [
            codigo, title, desc, availability, condition,
            price, link, image_link, brand
        ]

    # Guardar en CSV
    df_fb.to_csv(salida_path, index=False, encoding="utf-8")
    print(f"📦 CSV para Facebook guardado en: {salida_path} (filas: {len(df_fb)})")
    return df_fb

# ---------------------------
# MAIN
# ---------------------------
if __name__ == "__main__":
    convertir_a_jpg_reemplazo(imagenes_dir)
    generar_json(imagenes_dir, json_habilitados)
    df_fil = filtrar_excel_por_json(excel_original, json_habilitados, excel_filtrado)
    generar_excel_facebook(df_fil, excel_facebook)
