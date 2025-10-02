import os
import json
import re
import unicodedata
import pandas as pd
from PIL import Image
from datetime import datetime

# ---------------------------
# Config (ajustá si corresponde)
# ---------------------------
base_dir = os.path.dirname(os.path.abspath(__file__))
imagenes_dir = os.path.join(base_dir, "media/PRODUCTOS")
json_habilitados = os.path.join(base_dir, "media/Habilitados.json")
excel_original = os.path.join(base_dir, "media/articulos.xlsx")
excel_filtrado = os.path.join(base_dir, "media/articulos_filtrados.xlsx")
excel_facebook = os.path.join(base_dir, "media/articulos_facebook.xlsx")

# URL base pública de tu web (usa tu dominio real)
BASE_SITE_URL = "https://www.plutarcoalmacen.com.ar"

# Shipping default para Facebook: formato "COUNTRY:REGION:Service:PRICE CUR" (ej AR:::0.0 ARS)
# Si querés envío gratuito para todos pon "AR:::0.0 ARS"
DEFAULT_SHIPPING = ""  # ejemplo: "AR:::0.0 ARS" o "" para vacío

# ---------------------------
# Util: normalizar códigos
# ---------------------------
def normalize_code(s):
    """
    Normaliza un código:
    - convierte a str, NFKD (quita acentos), lower,
    - quita espacios y caracteres no alfanuméricos.
    Resultado: solo [a-z0-9] (sin espacios ni acentos).
    """
    if pd.isna(s):
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
    """
    Convierte cualquier imagen que no sea .jpg a JPG,
    reemplazando el archivo original.
    """
    if not os.path.isdir(carpeta):
        print(f"⚠️ Carpeta no encontrada: {carpeta}")
        return

    for archivo in os.listdir(carpeta):
        ruta_archivo = os.path.join(carpeta, archivo)
        if not os.path.isfile(ruta_archivo):
            continue

        nombre, extension = os.path.splitext(archivo)
        extension = extension.lower()

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
# Util: parsear precio a formato "number DECIMALS CURRENCY" (Facebook requiere "10.00 USD")
# ---------------------------
def format_price_for_facebook(price_str, currency_hint=None):
    """
    Convierte cadenas tipo "3.800,00" o "3800.00" a "3800.00 ARS" (o la moneda indicada).
    currency_hint: si se pasa, se usa (ej 'ARS' o 'USD'), sino intenta deducir o usa 'ARS'.
    """
    if pd.isna(price_str) or str(price_str).strip() == "":
        return ""
    s = str(price_str).strip()
    # Reemplazar puntos de miles y coma decimal por punto
    # Detectar si hay coma como decimal (ej "3.800,50")
    if ',' in s and s.count(',') == 1 and s.count('.') >= 1:
        # formato típico AR: "3.800,50"
        s = s.replace('.', '').replace(',', '.')
    else:
        # quitar cualquier espacio y comas de miles, dejar punto decimal si existe
        s = s.replace(',', '.').replace(' ', '').replace('.', lambda m: m.group(0) if '.' in s and s.rfind('.') > s.rfind(',') else '', 1) if False else s

        # Simpler approach: remove thousands separators common: if multiple dots, remove all but last
        parts = s.split('.')
        if len(parts) > 2:
            s = ''.join(parts[:-1]) + '.' + parts[-1]

        # replace remaining thousands separators (commas) if any
        s = s.replace(',', '')

    # Extra cleanup: keep digits and at most one dot
    s = re.sub(r'[^0-9.]', '', s)
    try:
        val = float(s)
    except:
        return ""

    currency = (currency_hint or "ARS").upper()
    return f"{val:.2f} {currency}"

# ---------------------------
# Paso 3: filtrar Excel usando nombres de imágenes (normalizados)
# ---------------------------
def filtrar_excel_por_imagenes(excel_path, carpeta_imagenes, salida_path):
    """
    Filtra el Excel dejando solo las filas cuyo CODIGO BARRA (normalizado)
    coincida con algún nombre de archivo .jpg (sin extensión) en carpeta_imagenes.
    """
    # obtener lista de archivos jpg existentes y normalizarlos
    jpg_files = [
        os.path.splitext(f)[0] for f in os.listdir(carpeta_imagenes)
        if os.path.isfile(os.path.join(carpeta_imagenes, f)) and f.lower().endswith(".jpg")
    ]
    jpg_norm_set = set(normalize_code(x) for x in jpg_files)

    # leer excel original
    df = pd.read_excel(excel_path, dtype=str)

    # detectar nombre de la columna codigo barra
    colname = None
    for col in df.columns:
        normalized_col = col.strip().lower().replace(" ", "")
        if normalized_col in ("codigodebarra", "codigobarra", "codigo", "codigo_barra", "codigobarra"):
            colname = col
            break
    if colname is None:
        raise ValueError("❌ No se encontró la columna 'CODIGO BARRA' en el Excel. Columnas disponibles: " + ", ".join(df.columns))

    # crear columna normalizada
    df["_norm_code"] = df[colname].astype(str).apply(normalize_code)

    # filtrar
    df_filtrado = df[df["_norm_code"].isin(jpg_norm_set)].copy()
    df_filtrado.drop(columns=["_norm_code"], inplace=True)

    # Reorden: mantengo el orden original del Excel (no lo reordeno)
    df_filtrado.to_excel(salida_path, index=False)
    print(f"✅ Excel filtrado guardado en: {salida_path} (filas: {len(df_filtrado)})")

    return df_filtrado

# ---------------------------
# Paso 4: generar articulos_facebook.xlsx
# ---------------------------
def generar_excel_facebook(df_filtrado, salida_path, base_site_url=BASE_SITE_URL, shipping_default=DEFAULT_SHIPPING):
    """
    Genera un Excel listo para Facebook con las columnas mínimas y algunas opcionales.
    Orden de columnas lo corresponde con la muestra que enviaste (cabeceras largas).
    """
    # Construir filas según mapping:
    rows = []
    for _, row in df_filtrado.iterrows():
        # identificar codigo (sin normalizar)
        # intentar obtener CODIGO BARRA con distintos nombres
        codigo_col = None
        for c in df_filtrado.columns:
            if c.strip().lower().replace(" ", "") in ("codigodebarra", "codigobarra", "codigo", "codigo_barra"):
                codigo_col = c
                break
        codigo = (row[codigo_col] if codigo_col else "").strip() if pd.notna(row.get(codigo_col, "")) else ""
        codigo = str(codigo)

        # title / description mapping
        def safe_str(val):
            if pd.isna(val):
                return ""
            return str(val).strip()

        title = safe_str(row.get("DESCRIPCION", "")) \
                or safe_str(row.get("DESCRIPCION LARGA", "")) \
                or safe_str(row.get("DESCRIPCION ADICIONAL", ""))

        description = safe_str(row.get("DESCRIPCION ADICIONAL", "")) \
                    or safe_str(row.get("DESCRIPCION LARGA", "")) \
                    or safe_str(row.get("DESCRIPCION", ""))

        # price: usamos PRECIO VENTA C/IVA si existe, sino PRECIO VENTA S/IVA
        precio_raw = row.get("PRECIO VENTA C/IVA") or row.get("PRECIO VENTA S/IVA") or row.get("PRECIO VENTA") or row.get("PRECIO", "")
        moneda = (row.get("MONEDA") or "ARS").strip().upper()
        price_fb = format_price_for_facebook(precio_raw, currency_hint=moneda)

        # image and link
        image_link = f"{base_site_url}/media/PRODUCTOS/{codigo}.jpg"
        product_link = f"{base_site_url}/producto/{codigo}"  # ajustá si tu ruta es distinta

        # brand, categories
        brand = row.get("MARCA") or ""
        google_cat = ""  # si tenés mapping de rubro -> google category podés implementarlo
        fb_cat = row.get("RUBRO") or ""

        # availability/condition
        availability = "in stock"
        condition = "new"

        # quantity
        quantity = ""  # opcional

        # sale_price / sale_price_effective_date -> dejar vacíos si no hay oferta
        sale_price = ""
        sale_period = ""

        # gender, color, size, age_group, material, pattern
        gender = ""
        color = row.get("COLOR") or ""
        size = row.get("TALLE") or row.get("SIZE") or ""
        age_group = ""
        material = row.get("MATERIAL") or ""
        pattern = row.get("PATRON") or ""

        # shipping, shipping_weight, gtin, video etc
        shipping = shipping_default
        shipping_weight = row.get("WEIGHT") or row.get("PESO") or ""
        gtin = row.get("GTIN") or row.get("UPC") or row.get("EAN") or ""
        video_url = ""

        # agrego fila en el orden de columnas de Facebook (simplificado)
        rows.append({
            "id": codigo,
            "title": title[:200],
            "description": description[:9999],
            "availability": availability,
            "condition": condition,
            "price": price_fb,
            "link": product_link,
            "image_link": image_link,
            "brand": brand,
            "google_product_category": google_cat,
            "fb_product_category": fb_cat,
            "quantity_to_sell_on_facebook": quantity,
            "sale_price": sale_price,
            "sale_price_effective_date": sale_period,
            "item_group_id": "",
            "gender": gender,
            "color": color,
            "size": size,
            "age_group": age_group,
            "material": material,
            "pattern": pattern,
            "shipping": shipping,
            "shipping_weight": shipping_weight,
            "gtin": gtin,
            "video[0].url": video_url,
            # podés agregar más campos si los necesitás
        })

    # columnas deseadas en orden (ajustá si querés más/menos)
    columns_order = [
        "id", "title", "description", "availability", "condition", "price",
        "link", "image_link", "brand", "google_product_category", "fb_product_category",
        "quantity_to_sell_on_facebook", "sale_price", "sale_price_effective_date",
        "item_group_id", "gender", "color", "size", "age_group", "material",
        "pattern", "shipping", "shipping_weight", "gtin", "video[0].url"
    ]

    df_fb = pd.DataFrame(rows, columns=columns_order)
    df_fb.to_excel(salida_path, index=False)
    print(f"✅ Excel para Facebook generado en: {salida_path} (filas: {len(df_fb)})")
    return df_fb

# ---------------------------
# MAIN
# ---------------------------
if __name__ == "__main__":
    # 1) convertir imágenes (reemplazo)
    convertir_a_jpg_reemplazo(imagenes_dir)

    # 2) generar JSON (opcional, útil para debug)
    generar_json(imagenes_dir, json_habilitados)

    # 3) filtrar Excel por existencia de imagenes y guardar articulos_filtrados.xlsx
    df_fil = filtrar_excel_por_imagenes(excel_original, imagenes_dir, excel_filtrado)

    # 4) generar articulos_facebook.xlsx a partir del filtrado
    generar_excel_facebook(df_fil, excel_facebook)

    print("🎉 Proceso completado.")
