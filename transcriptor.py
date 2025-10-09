import os
import json
import re
import unicodedata
import pandas as pd
from PIL import Image


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
# Util: limpiar precio argentino → float
# ---------------------------
def limpiar_precio(valor):
    if pd.isna(valor):
        return 0.0
    try:
        s = str(valor).strip()
        # Quitar separador de miles
        s = s.replace('.', '')
        # Reemplazar coma decimal por punto
        s = s.replace(',', '.')
        return float(s)
    except:
        return 0.0

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

def generar_excel_facebook(excel_filtrado_path, ranking_path, output_path, use_sequential=False):
    """
    Genera un CSV para Facebook a partir del Excel filtrado y un ranking por categoría.
    - Respeta el orden de las categorías según aparecen en el Excel.
    - Dentro de cada categoría, respeta el orden de Ranking.csv.
    - Si un producto no está en Ranking.csv, va al final de su categoría con un ID alto.
    - use_sequential=True ignora Ranking y asigna IDs secuenciales globales.
    """
    import pandas as pd

    # 1. Cargar Excel filtrado
    df_fil = pd.read_excel(excel_filtrado_path)
    print(f"✅ Excel filtrado cargado ({len(df_fil)} filas)")

    # 2. Cargar ranking
    rank_map = {}
    try:
        ranking = pd.read_csv(ranking_path, sep=";")
        ranking.columns = [c.strip().upper() for c in ranking.columns]

        if "PRODUCTO" in ranking.columns and "RANKING" in ranking.columns:
            for _, row in ranking.iterrows():
                if pd.isna(row["PRODUCTO"]) or pd.isna(row["RANKING"]):
                    continue
                nombre_rank = normalize_code(str(row["PRODUCTO"]))
                try:
                    rank_map[nombre_rank] = int(row["RANKING"])
                except:
                    continue
            print(f"✅ Ranking cargado desde {ranking_path} ({len(rank_map)} productos)")
        else:
            print("⚠️ Ranking.csv no tiene columnas PRODUCTO y RANKING, se ignora.")
    except Exception as e:
        print(f"⚠️ No se pudo leer Ranking.csv: {e}")

    # 3. Armar filas agrupadas por categoría
    rows = []
    current_id = 1
    if "RUBRO" not in df_fil.columns:
        df_fil["RUBRO"] = "Sin categoría"

    categorias = df_fil["RUBRO"].unique().tolist()

    for categoria in categorias:
        df_cat = df_fil[df_fil["RUBRO"] == categoria].copy()

        if not use_sequential:
            df_cat["_norm_title"] = df_cat["DESCRIPCION LARGA"].astype(str).apply(normalize_code)
            df_cat["_ranking"] = df_cat["_norm_title"].map(rank_map).fillna(9999).astype(int)
            df_cat = df_cat.sort_values(by="_ranking")
        else:
            df_cat["_ranking"] = range(1, len(df_cat) + 1)

        for _, row in df_cat.iterrows():
            title = str(row.get("DESCRIPCION LARGA", "")).strip()
            
            precio_val = limpiar_precio(row.get("PRECIO VENTA C/IVA", ""))
            if precio_val == 0:
                continue
            
            price = f"{precio_val:.2f} ARS"

            codigo = str(row.get("CODIGO BARRA", "")).strip()

            rows.append({
                "id": current_id+1000,
                "title": title,
                "description": row.get("DESCRIPCION ADICIONAL", ""),
                "availability": "in stock",
                "condition": "new",
                "price": price,
                "link": f"https://plutarcoalmacen.com.ar/",
                "image_link": f"https://plutarcoalmacen.com.ar/media/PRODUCTOS/{codigo}.jpg",
                "brand": row.get("MARCA", ""),
                "google_product_category": categoria,
            })
            current_id += 1

    # 4. Guardar CSV
    df_out = pd.DataFrame(rows)
    df_out.to_csv(output_path, sep=";", index=False, encoding="utf-8")
    print(f"📦 CSV para Facebook guardado en: {output_path} (filas: {len(df_out)})")

# ---------------------------
# MAIN
# ---------------------------
if __name__ == "__main__":
    # Rutas absolutas (ajustá si lo necesitás)
    excel_original = "/home/felipe/Documents/plutarco.github.io/media/articulos.xlsx"
    excel_filtrado = "/home/felipe/Documents/plutarco.github.io/media/articulos_filtrados.xlsx"
    ranking_csv = "/home/felipe/Documents/plutarco.github.io/media/Ranking.csv"
    excel_facebook = "/home/felipe/Documents/plutarco.github.io/media/articulos_facebook.csv"
    imagenes_dir = "/home/felipe/Documents/plutarco.github.io/media/PRODUCTOS"
    json_habilitados = "/home/felipe/Documents/plutarco.github.io/media/Habilitados.json"

    print("🌀 Paso 1: Convirtiendo imágenes a JPG (reemplazo si es necesario)...")
    convertir_a_jpg_reemplazo(imagenes_dir)

    print("🌀 Paso 2: Generando JSON de productos habilitados...")
    nombres_json = generar_json(imagenes_dir, json_habilitados)
    print(f"✅ JSON generado con {len(nombres_json)} productos en {json_habilitados}")

    print("🌀 Paso 3: Filtrando Excel según habilitados.json...")
    df_fil = filtrar_excel_por_json(excel_original, json_habilitados, excel_filtrado)
    print(f"✅ Excel filtrado guardado en: {excel_filtrado} (filas: {len(df_fil)})")

    print("🌀 Paso 4: Generando CSV para catálogo de Facebook...")
    generar_excel_facebook(
        excel_filtrado,   # Excel filtrado
        ranking_csv,      # Ranking.csv
        excel_facebook,   # CSV de salida
        use_sequential=False  # False → usa Ranking.csv | True → IDs secuenciales
    )

    print("\n🎯 Proceso completado correctamente.")



